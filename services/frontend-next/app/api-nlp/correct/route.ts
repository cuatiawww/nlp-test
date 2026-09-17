import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const nlpUrl = process.env.NLP_INTERNAL_URL || "http://disease-nlp-python:8000";
    const res = await fetch(`${nlpUrl}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to forward correction to NLP service", detail: error?.message },
      { status: 500 }
    );
  }
}
