import { glasshomeWidgets } from "@glasshome/widget-sdk/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  // delegateEvents: false — widgets render inside closed shadow roots where
  // Solid's document-level event delegation never sees the target.
  plugins: [solid({ solid: { delegateEvents: false } }), ...glasshomeWidgets()],
});
