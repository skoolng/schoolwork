const allowedHost = "raw.githubusercontent.com";
const allowedPathPrefix = "/skoolng/schoolwork/main/data/classroom/";

function inlineFilename(pathname: string) {
  const rawName = decodeURIComponent(pathname.split("/").pop() || "document.pdf");
  const safeName = rawName.replace(/[\r\n"\\]/g, "_");
  return `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

export async function GET(request: Request) {
  const requestedUrl = new URL(request.url).searchParams.get("url");
  if (!requestedUrl) {
    return Response.json({ error: "A file URL is required." }, { status: 400 });
  }

  let source: URL;
  try {
    source = new URL(requestedUrl);
  } catch {
    return Response.json({ error: "The file URL is invalid." }, { status: 400 });
  }

  if (
    source.protocol !== "https:" ||
    source.hostname !== allowedHost ||
    !source.pathname.startsWith(allowedPathPrefix)
  ) {
    return Response.json({ error: "This file source is not allowed." }, { status: 403 });
  }

  const upstreamHeaders = new Headers({ accept: "application/pdf" });
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("range", range);

  const upstream = await fetch(source, {
    headers: upstreamHeaders,
    redirect: "follow",
  });
  if (!upstream.ok && upstream.status !== 206) {
    return Response.json(
      { error: `The archived file could not be loaded (${upstream.status}).` },
      { status: upstream.status },
    );
  }

  const headers = new Headers({
    "accept-ranges": upstream.headers.get("accept-ranges") ?? "bytes",
    "cache-control": "public, max-age=31536000, immutable",
    "content-disposition": inlineFilename(source.pathname),
    "content-type": "application/pdf",
    "x-content-type-options": "nosniff",
  });
  for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
