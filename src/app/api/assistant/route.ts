import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { jsonError } from "@/server/http";
import { assistantMessages } from "@/server/assistant";

/** 助理的提醒（只回給登入的本人，不寫入 log） */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("請先登入", 401);
  const messages = await assistantMessages(await getDb(), user);
  return NextResponse.json({ messages }, { headers: { "Cache-Control": "private, no-store" } });
}
