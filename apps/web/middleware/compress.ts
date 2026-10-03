import { onResponse } from "nitro/h3";
import { brotliCompress, constants, gzip } from "node:zlib";

const MIN_COMPRESS_BYTES = 1024;
const BROTLI_QUALITY = 5;
const GZIP_LEVEL = 6;
const COMPRESSIBLE_TYPE =
  /^(?:application\/(?:json|.*\+json|javascript|xml|.*\+xml)|text\/(?:plain|css|csv|html|markdown))/i;

function negotiateEncoding(header: string | null) {
  if (!header) return null;

  const accepted = new Map<string, number>();
  for (const part of header.split(",")) {
    const [rawName, ...params] = part.trim().split(";");
    const name = rawName.trim().toLowerCase();
    if (!name) continue;
    const qParam = params
      .map((param) => param.trim())
      .find((param) => param.startsWith("q="));
    const quality = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
    accepted.set(name, Number.isFinite(quality) ? quality : 0);
  }

  for (const name of ["br", "gzip"] as const) {
    if ((accepted.get(name) ?? 0) > 0) return name;
  }
  return null;
}

function compressBrotli(input: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    brotliCompress(
      input,
      { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } },
      (error, output) =>
        error ? reject(error) : resolve(new Uint8Array(output)),
    );
  });
}

function compressGzip(input: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    gzip(input, { level: GZIP_LEVEL }, (error, output) =>
      error ? reject(error) : resolve(new Uint8Array(output)),
    );
  });
}

export default onResponse(async (response, event) => {
  if (!event.url.pathname.startsWith("/api/")) return;
  if (event.req.method === "HEAD") return;
  if (!response.body) return;
  if (
    response.status === 204 ||
    response.status === 206 ||
    response.status === 304
  )
    return;
  if (response.headers.has("content-encoding")) return;
  if (response.headers.get("cache-control")?.includes("no-transform")) return;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("text/event-stream")) return;
  if (!COMPRESSIBLE_TYPE.test(contentType)) return;

  const encoding = negotiateEncoding(
    event.req.headers.get("accept-encoding"),
  );
  if (!encoding) return;

  const lengthHeader = response.headers.get("content-length");
  const declaredLength =
    lengthHeader === null || lengthHeader.trim() === ""
      ? Number.NaN
      : Number(lengthHeader);
  if (Number.isFinite(declaredLength) && declaredLength < MIN_COMPRESS_BYTES) {
    return;
  }

  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength < MIN_COMPRESS_BYTES) {
    const headers = new Headers(response.headers);
    headers.set("content-length", String(body.byteLength));
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const compressed =
    encoding === "br" ? await compressBrotli(body) : await compressGzip(body);

  const headers = new Headers(response.headers);
  headers.set("content-encoding", encoding);
  headers.set("content-length", String(compressed.byteLength));
  headers.delete("etag");
  const vary = headers.get("vary");
  if (!vary) headers.set("vary", "accept-encoding");
  else if (!vary.toLowerCase().includes("accept-encoding"))
    headers.append("vary", "accept-encoding");

  return new Response(compressed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
