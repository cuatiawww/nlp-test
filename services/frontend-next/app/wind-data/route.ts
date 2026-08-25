// Keep wind data outside /api because production reverse proxies reserve
// /nlp/api/* for the Rust backend.
export { GET } from "../api/gfs/route";
