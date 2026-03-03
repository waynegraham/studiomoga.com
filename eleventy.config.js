let eleventyImageTransformPlugin;
try {
    ({ eleventyImageTransformPlugin } = require("@11ty/eleventy-img"));
} catch (error) {
    console.warn("[11ty] @11ty/eleventy-img not installed; skipping Image HTML Transform plugin.");
}

module.exports = function(eleventyConfig) {
    if (eleventyImageTransformPlugin) {
        eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
            formats: ["avif", "webp", "jpeg"],
            widths: ["auto"],
            htmlOptions: {
                imgAttributes: {
                    loading: "lazy",
                    decoding: "async"
                },
                pictureAttributes: {}
            }
        });
    }

    eleventyConfig.addPassthroughCopy("src/assets");
    eleventyConfig.addPassthroughCopy("src/images");

    return {
        pathPrefix: "/studiomoga.com/",
        dir: {
            input: "src",
            output: "_site",
            includes: "_includes",
            layouts: "_layouts"
        }
    }
}
