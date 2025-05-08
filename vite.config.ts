import {defineConfig} from "vite";
import glsl from "vite-plugin-glsl";
import {viteStaticCopy} from "vite-plugin-static-copy";

export default defineConfig({
    server: {
        open: true,
        port: 5500
    },

    plugins: [
        glsl(),
        viteStaticCopy({
            targets: [
                {
                    src: "assets",
                    dest: ''
                }
            ]
        })
    ]
});
