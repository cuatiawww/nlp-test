/** Browser asset prefix. Keep this independent from the backend API URL. */
export const PUBLIC_BASE_PATH = (
  process.env.NEXT_PUBLIC_BASE_PATH || "/nlp"
).replace(/\/$/, "");
