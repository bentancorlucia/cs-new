import { NextRequest, NextResponse } from "next/server";
import { getActivePopupForPath } from "@/lib/popups/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const path = new URL(request.url).searchParams.get("path") ?? "/";
  try {
    const popup = await getActivePopupForPath(path);
    return NextResponse.json({ popup });
  } catch {
    return NextResponse.json({ popup: null });
  }
}
