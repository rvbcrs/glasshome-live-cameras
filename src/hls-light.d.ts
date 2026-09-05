// hls.js ships types for the main entry only; the light build has the same API.
declare module "hls.js/light" {
  export * from "hls.js";
  export { default } from "hls.js";
}
