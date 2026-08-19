import { listParsers } from "@/lib/parsers";
export async function GET() {
  return Response.json({ parsers: listParsers() });
}
