const ext = globalThis.browser ?? globalThis.chrome;

const state = {
    toolActive: {
        zIndex: false,
        overflow: false,
        layout: false,
        darkMode: false,
        noAnimations: false,
        noImages: false,
        forceHover: false,
        colorBlind: "none",
        disableAvif: false,
        disableWebp: false
    },
    prefersColorSchemeEmulation: null,
    styleNodes: new Map(),
    overlayNodes: [],
    ariaInspectorInstalled: false,
    ariaInspectorEnabled: false,
    ariaTooltip: null,
    imageFormatObserver: null,
    mediaQueryWrappers: new Set()
};

const originalMatchMedia = window.matchMedia.bind(window);

function parseColorSchemeQuery(query) {
    if (typeof query !== "string") {
        return { isDark: false, isLight: false };
    }
    const q = query.replace(/\s+/g, " ").trim().toLowerCase();
    return {
        isDark: q.includes("prefers-color-scheme: dark") || q.includes("(prefers-color-scheme:dark)"),
        isLight: q.includes("prefers-color-scheme: light") || q.includes("(prefers-color-scheme:light)")
    };
}

function getEmulatedMatch(query, fallback) {
    const emulated = state.prefersColorSchemeEmulation;
    if (!emulated) {
        return fallback;
    }

    const { isDark, isLight } = parseColorSchemeQuery(query);
    if (!isDark && !isLight) {
        return fallback;
    }

    return (isDark && emulated === "dark") || (isLight && emulated === "light");
}

window.matchMedia = function (query) {
    const mql = originalMatchMedia(query);
    const { isDark, isLight } = parseColorSchemeQuery(query);
    if (!isDark && !isLight) {
        return mql;
    }

    const listeners = new Set();
    let onChangeHandler = null;

    const wrapper = {
        get matches() {
            return getEmulatedMatch(query, mql.matches);
        },
        get media() { return query; },
        addListener(fn) {
            if (typeof fn === "function") {
                listeners.add(fn);
            }
        },
        removeListener(fn) {
            listeners.delete(fn);
        },
        addEventListener(type, fn) {
            if (type === "change" && typeof fn === "function") {
                listeners.add(fn);
            }
        },
        removeEventListener(type, fn) {
            if (type === "change") {
                listeners.delete(fn);
            }
        },
        dispatchEvent(event) {
            listeners.forEach((fn) => {
                try {
                    fn.call(wrapper, event);
                } catch (_error) {
                    // Ignore listener errors.
                }
            });
            return true;
        },
        get onchange() {
            return onChangeHandler;
        },
        set onchange(fn) {
            if (onChangeHandler) {
                listeners.delete(onChangeHandler);
            }
            onChangeHandler = typeof fn === "function" ? fn : null;
            if (onChangeHandler) {
                listeners.add(onChangeHandler);
            }
        },
        __notify() {
            const event = { matches: wrapper.matches, media: query, type: "change", target: wrapper, currentTarget: wrapper };
            wrapper.dispatchEvent(event);
        }
    };

    state.mediaQueryWrappers.add(wrapper);
    return wrapper;
};

function notifyColorSchemeMqls() {
    state.mediaQueryWrappers.forEach((wrapper) => {
        if (wrapper && typeof wrapper.__notify === "function") {
            wrapper.__notify();
        }
    });
}

function addStyle(id, cssText) {
    removeStyle(id);

    const style = document.createElement("style");
    style.dataset.sourceToolkit = id;
    style.textContent = cssText;
    document.documentElement.append(style);
    state.styleNodes.set(id, style);
}

function removeStyle(id) {
    const style = state.styleNodes.get(id);
    if (style) {
        style.remove();
    }
    state.styleNodes.delete(id);
}

function clearOverlays() {
    for (const node of state.overlayNodes) {
        node.remove();
    }
    state.overlayNodes = [];

    document.querySelectorAll("[data-source-layout],[data-source-overflow]").forEach((node) => {
        node.removeAttribute("data-source-layout");
        node.removeAttribute("data-source-overflow");
    });
}

function createOverlayLabel(text, rect, color = "#0b67ff") {
    const label = document.createElement("div");
    label.textContent = text;
    label.style.position = "fixed";
    label.style.left = `${Math.max(0, rect.left)}px`;
    label.style.top = `${Math.max(0, rect.top - 14)}px`;
    label.style.background = color;
    label.style.color = "#fff";
    label.style.font = "10px -apple-system, sans-serif";
    label.style.padding = "1px 4px";
    label.style.borderRadius = "4px";
    label.style.zIndex = "2147483647";
    label.style.pointerEvents = "none";
    label.style.maxWidth = "200px";
    label.style.whiteSpace = "nowrap";
    label.style.overflow = "hidden";
    label.style.textOverflow = "ellipsis";
    document.documentElement.append(label);
    state.overlayNodes.push(label);
}

function toggleZIndex(active) {
    if (!active) {
        clearOverlays();
        return;
    }

    clearOverlays();
    const elements = [...document.querySelectorAll("body *")];
    let shown = 0;

    for (const node of elements) {
        if (shown >= 160) {
            break;
        }

        const style = getComputedStyle(node);
        if (style.position === "static" || style.zIndex === "auto") {
            continue;
        }

        const rect = node.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) {
            continue;
        }

        createOverlayLabel(`z:${style.zIndex}`, rect, "#7c3aed");
        shown += 1;
    }
}

function toggleOverflow(active) {
    if (!active) {
        clearOverlays();
        removeStyle("overflow-style");
        return;
    }

    removeStyle("layout-style");
    addStyle(
        "overflow-style",
        `[data-source-overflow="true"] { outline: 2px solid #dc2626 !important; outline-offset: 1px !important; }`
    );

    document.querySelectorAll("body *").forEach((node) => {
        const style = getComputedStyle(node);
        const overflowing = (node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight)
            && style.overflow !== "visible";

        if (overflowing) {
            node.setAttribute("data-source-overflow", "true");
            const rect = node.getBoundingClientRect();
            createOverlayLabel("overflow", rect, "#dc2626");
        }
    });
}

function toggleLayout(active) {
    if (!active) {
        clearOverlays();
        removeStyle("layout-style");
        return;
    }

    removeStyle("overflow-style");
    addStyle(
        "layout-style",
        `[data-source-layout="flex"] { outline: 2px dashed #0ea5e9 !important; }
         [data-source-layout="grid"] { outline: 2px dashed #16a34a !important; }`
    );

    document.querySelectorAll("body *").forEach((node) => {
        const display = getComputedStyle(node).display;
        if (display.includes("flex")) {
            node.setAttribute("data-source-layout", "flex");
            createOverlayLabel("flex", node.getBoundingClientRect(), "#0ea5e9");
        } else if (display.includes("grid")) {
            node.setAttribute("data-source-layout", "grid");
            createOverlayLabel("grid", node.getBoundingClientRect(), "#16a34a");
        }
    });
}

function toggleDarkMode(active) {
    if (active) {
        addStyle(
            "dark-mode-style",
            `html { filter: invert(1) hue-rotate(180deg) !important; }
             img, video, picture, canvas { filter: invert(1) hue-rotate(180deg) !important; }`
        );
    } else {
        removeStyle("dark-mode-style");
    }
}

function toggleNoAnimations(active) {
    if (active) {
        addStyle(
            "no-anim-style",
            `*, *::before, *::after {
                animation: none !important;
                transition: none !important;
                scroll-behavior: auto !important;
            }`
        );
    } else {
        removeStyle("no-anim-style");
    }
}

function toggleNoImages(active) {
    if (active) {
        addStyle(
            "no-images-style",
            `img, picture, svg, video, canvas {
                visibility: hidden !important;
            }
            * {
                background-image: none !important;
            }`
        );
    } else {
        removeStyle("no-images-style");
    }
}

function installForceHover() {
    const handler = (event) => {
        document.querySelectorAll("[data-force-hover='true']").forEach((node) => {
            node.removeAttribute("data-force-hover");
        });

        let el = event.target;
        let depth = 0;
        while (el && depth < 3) {
            if (el instanceof HTMLElement) {
                el.setAttribute("data-force-hover", "true");
                depth += 1;
                el = el.parentElement;
            } else {
                break;
            }
        }
    };

    document.addEventListener("mouseover", handler, true);
    document.documentElement.dataset.forceHoverHandlerInstalled = "true";
    document.documentElement._sourceForceHoverHandler = handler;
}

function removeForceHover() {
    const handler = document.documentElement._sourceForceHoverHandler;
    if (handler) {
        document.removeEventListener("mouseover", handler, true);
    }
    document.querySelectorAll("[data-force-hover='true']").forEach((node) => {
        node.removeAttribute("data-force-hover");
    });
    delete document.documentElement._sourceForceHoverHandler;
    delete document.documentElement.dataset.forceHoverHandlerInstalled;
}

function toggleForceHover(active) {
    if (active) {
        addStyle(
            "force-hover-style",
            `[data-force-hover='true'] {
                outline: 2px solid #f59e0b !important;
                outline-offset: 1px !important;
            }`
        );

        if (!document.documentElement.dataset.forceHoverHandlerInstalled) {
            installForceHover();
        }
    } else {
        removeStyle("force-hover-style");
        removeForceHover();
    }
}

function setColorBlindFilter(filterName) {
    const filters = {
        none: "",
        protanopia: "url('#') grayscale(0.1) sepia(0.2) saturate(0.8)",
        deuteranopia: "grayscale(0.25) hue-rotate(-20deg)",
        tritanopia: "grayscale(0.2) hue-rotate(35deg)",
        blurred: "blur(3px)",
        "reduced-contrast": "contrast(0.5)",
        achromatopsia: "grayscale(1)"
    };

    state.toolActive.colorBlind = filterName in filters ? filterName : "none";
    const value = filters[state.toolActive.colorBlind];

    if (!value) {
        removeStyle("color-blind-style");
        return { active: "none" };
    }

    addStyle(
        "color-blind-style",
        `html {
            filter: ${value} !important;
        }`
    );

    return { active: state.toolActive.colorBlind };
}

function setPrefersColorSchemeEmulation(value) {
    state.prefersColorSchemeEmulation = value === "light" || value === "dark" ? value : null;
    const root = document.documentElement;
    if (state.prefersColorSchemeEmulation) {
        root.style.setProperty("color-scheme", state.prefersColorSchemeEmulation);
        root.setAttribute("data-prefers-color-scheme", state.prefersColorSchemeEmulation);
    } else {
        root.style.removeProperty("color-scheme");
        root.removeAttribute("data-prefers-color-scheme");
    }
    notifyColorSchemeMqls();
    return { value: state.prefersColorSchemeEmulation };
}

function fallbackUrlForFormat(url, format) {
    if (!url || typeof url !== "string") return url;
    const lower = url.toLowerCase();
    if (format === "avif" && (lower.includes(".avif") || lower.includes("format=avif"))) {
        return url.replace(/\.avif(\?|$)/i, ".jpg$1").replace(/([?&])format=avif(&|$)/i, "$1format=jpg$2");
    }
    if (format === "webp" && (lower.includes(".webp") || lower.includes("format=webp"))) {
        return url.replace(/\.webp(\?|$)/i, ".jpg$1").replace(/([?&])format=webp(&|$)/i, "$1format=jpg$2");
    }
    return null;
}

function rewriteImageFormat(format) {
    const isAvif = format === "avif";
    const ext = isAvif ? ".avif" : ".webp";
    const type = isAvif ? "image/avif" : "image/webp";

    document.querySelectorAll("img[src]").forEach((img) => {
        if (img.hasAttribute("data-original-src")) return;
        const src = img.getAttribute("src");
        const fallback = fallbackUrlForFormat(src, format);
        if (fallback && fallback !== src) {
            img.setAttribute("data-original-src", src);
            img.src = fallback;
        }
    });

    document.querySelectorAll(`source[type="${type}"], source[srcset*="${ext}"]`).forEach((source) => {
        if (source.hasAttribute("data-original-srcset") || source.hasAttribute("data-original-src")) return;
        const srcset = source.getAttribute("srcset");
        const src = source.getAttribute("src");
        if (srcset) {
            const rewritten = srcset.split(",").map((part) => {
                const u = part.trim().split(/\s+/)[0];
                const f = fallbackUrlForFormat(u, format);
                return f ? part.replace(u, f) : part;
            }).join(", ");
            if (rewritten !== srcset) {
                source.setAttribute("data-original-srcset", srcset);
                source.setAttribute("srcset", rewritten);
            }
        }
        if (src) {
            const f = fallbackUrlForFormat(src, format);
            if (f) {
                source.setAttribute("data-original-src", src);
                source.setAttribute("src", f);
            }
        }
    });
}

function observeImageFormat(format) {
    if (state.imageFormatObserver) return;

    state.imageFormatObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.addedNodes.length) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    if (state.toolActive.disableAvif) rewriteImageFormat("avif");
                    if (state.toolActive.disableWebp) rewriteImageFormat("webp");
                    if (node.querySelectorAll) {
                        node.querySelectorAll("img[src], source[srcset], source[src]").forEach((el) => {
                            if (state.toolActive.disableAvif) {
                                const src = el.getAttribute("src") || el.getAttribute("srcset") || "";
                                if (fallbackUrlForFormat(src, "avif") || el.getAttribute("type") === "image/avif") {
                                    rewriteImageFormat("avif");
                                }
                            }
                            if (state.toolActive.disableWebp) {
                                const src = el.getAttribute("src") || el.getAttribute("srcset") || "";
                                if (fallbackUrlForFormat(src, "webp") || el.getAttribute("type") === "image/webp") {
                                    rewriteImageFormat("webp");
                                }
                            }
                        });
                    }
                    break;
                }
            }
        }
    });

    state.imageFormatObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function setImageFormatDisabled(format, disable) {
    if (format === "avif") {
        state.toolActive.disableAvif = Boolean(disable);
    } else if (format === "webp") {
        state.toolActive.disableWebp = Boolean(disable);
    }

    if (state.toolActive.disableAvif || state.toolActive.disableWebp) {
        observeImageFormat(format);
        if (state.toolActive.disableAvif) rewriteImageFormat("avif");
        if (state.toolActive.disableWebp) rewriteImageFormat("webp");
    } else {
        if (state.imageFormatObserver) {
            state.imageFormatObserver.disconnect();
            state.imageFormatObserver = null;
        }
    }

    return { disableAvif: state.toolActive.disableAvif, disableWebp: state.toolActive.disableWebp };
}

function computeSeoSnapshot() {
    const title = document.title || "";
    const metaDescription = document.querySelector('meta[name="description"]')?.content || "";
    const canonicalUrl = document.querySelector('link[rel="canonical"]')?.href || "";
    const authorLink = document.querySelector('link[rel~="author"]')?.getAttribute("href") || "";
    const monetizationLink = document.querySelector('link[rel~="monetization"]')?.getAttribute("href") || "";
    const pingbackLink = document.querySelector('link[rel~="pingback"]')?.getAttribute("href") || "";
    const webmentionLink = document.querySelector('link[rel~="webmention"]')?.getAttribute("href") || "";
    const alternateFeeds = [...document.querySelectorAll('link[rel~="alternate"]')]
        .map((link) => ({
            href: link.getAttribute("href") || "",
            type: link.getAttribute("type") || "",
            title: link.getAttribute("title") || ""
        }))
        .filter((item) => {
            const type = item.type.toLowerCase();
            return Boolean(item.href) && (type.includes("rss") || type.includes("atom") || type.includes("xml"));
        })
        .slice(0, 10);
    const fediverseCreator = document.querySelector('meta[name="fediverse:creator"]')?.getAttribute("content") || "";
    const generator = document.querySelector('meta[name="generator"]')?.getAttribute("content") || "";
    const lastModified = document.querySelector('meta[name="last-modified"]')?.getAttribute("content") || "";
    const themeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || "";
    const colorScheme = document.querySelector('meta[name="color-scheme"]')?.getAttribute("content") || "";

    const openGraphTags = [...document.querySelectorAll('meta[property^="og:"]')]
        .map((meta) => ({
            property: meta.getAttribute("property") || "og:*",
            content: meta.getAttribute("content") || "(empty)"
        }))
        .slice(0, 30);
    const openGraphCount = openGraphTags.length;

    const structuredData = [];
    const structuredDataItems = [];
    if (document.querySelectorAll('script[type="application/ld+json"]').length) {
        structuredData.push("JSON-LD");
        const jsonLdScripts = [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 12);
        for (const script of jsonLdScripts) {
            try {
                const parsed = JSON.parse(script.textContent || "{}");
                const nodes = Array.isArray(parsed) ? parsed : [parsed];
                for (const node of nodes) {
                    if (!node || typeof node !== "object") {
                        continue;
                    }
                    const typeField = node["@type"];
                    if (Array.isArray(typeField)) {
                        structuredDataItems.push(`JSON-LD: ${typeField.join(", ")}`);
                    } else if (typeof typeField === "string" && typeField.trim()) {
                        structuredDataItems.push(`JSON-LD: ${typeField}`);
                    } else {
                        structuredDataItems.push("JSON-LD: (type not specified)");
                    }
                }
            } catch (_error) {
                structuredDataItems.push("JSON-LD: (unparseable)");
            }
        }
    }
    if (document.querySelector("[itemscope]")) {
        structuredData.push("Microdata");
        const microdataNodes = [...document.querySelectorAll("[itemscope]")].slice(0, 10);
        for (const node of microdataNodes) {
            const type = node.getAttribute("itemtype") || "(type not specified)";
            structuredDataItems.push(`Microdata: ${type}`);
        }
    }
    if (document.querySelector("[typeof]")) {
        structuredData.push("RDFa");
        const rdfaNodes = [...document.querySelectorAll("[typeof]")].slice(0, 10);
        for (const node of rdfaNodes) {
            const type = node.getAttribute("typeof") || "(type not specified)";
            structuredDataItems.push(`RDFa: ${type}`);
        }
    }

    const warnings = [];
    if (title.length < 10 || title.length > 100) {
        warnings.push(`Title length ${title.length} (target 10-100)`);
    }
    if (metaDescription.length < 50 || metaDescription.length > 250) {
        warnings.push(`Meta description ${metaDescription.length} (target 50-250)`);
    }
    if (!canonicalUrl) {
        warnings.push("Canonical URL is missing");
    }
    return {
        title,
        titleLength: title.length,
        metaDescription,
        metaDescriptionLength: metaDescription.length,
        canonicalUrl,
        authorLink,
        monetizationLink,
        pingbackLink,
        webmentionLink,
        alternateFeeds,
        fediverseCreator,
        generator,
        lastModified,
        themeColor,
        colorScheme,
        openGraphCount,
        openGraphTags,
        structuredData,
        structuredDataItems: structuredDataItems.slice(0, 30),
        warnings
    };
}

function parseRgb(color) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) {
        return [255, 255, 255];
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance([r, g, b]) {
    const values = [r, g, b].map((value) => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrastRatio(foreground, background) {
    const l1 = luminance(parseRgb(foreground));
    const l2 = luminance(parseRgb(background));
    const high = Math.max(l1, l2);
    const low = Math.min(l1, l2);
    return (high + 0.05) / (low + 0.05);
}

function getEffectiveBackgroundColor(node) {
    let current = node;
    while (current && current !== document.documentElement) {
        const color = getComputedStyle(current).backgroundColor;
        if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
            return color;
        }
        current = current.parentElement;
    }
    return "rgb(255, 255, 255)";
}

function ensureAriaInspector() {
    if (state.ariaInspectorInstalled) {
        return;
    }

    state.ariaTooltip = document.createElement("div");
    state.ariaTooltip.style.position = "fixed";
    state.ariaTooltip.style.zIndex = "2147483647";
    state.ariaTooltip.style.maxWidth = "300px";
    state.ariaTooltip.style.background = "#111827";
    state.ariaTooltip.style.color = "#f9fafb";
    state.ariaTooltip.style.padding = "6px 8px";
    state.ariaTooltip.style.borderRadius = "8px";
    state.ariaTooltip.style.font = "11px -apple-system, sans-serif";
    state.ariaTooltip.style.pointerEvents = "none";
    state.ariaTooltip.style.display = "none";
    document.documentElement.append(state.ariaTooltip);

    document.addEventListener(
        "click",
        (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }
            if (!state.ariaInspectorEnabled) {
                return;
            }

            const attrs = [];
            for (const attr of target.attributes) {
                if (attr.name.startsWith("aria-") || attr.name === "role") {
                    attrs.push(`${attr.name}=${attr.value}`);
                }
            }

            const summary = attrs.length ? attrs.join(" | ") : "No ARIA attributes";
            const rect = target.getBoundingClientRect();
            state.ariaTooltip.textContent = summary;
            state.ariaTooltip.style.left = `${Math.max(4, rect.left)}px`;
            state.ariaTooltip.style.top = `${Math.max(4, rect.top - 30)}px`;
            state.ariaTooltip.style.display = "block";

            setTimeout(() => {
                if (state.ariaTooltip) {
                    state.ariaTooltip.style.display = "none";
                }
            }, 2500);
        },
        true
    );

    state.ariaInspectorInstalled = true;
}

function setAriaInspectorEnabled(enabled) {
    ensureAriaInspector();
    state.ariaInspectorEnabled = Boolean(enabled);
    if (!state.ariaInspectorEnabled && state.ariaTooltip) {
        state.ariaTooltip.style.display = "none";
    }
    return { active: state.ariaInspectorEnabled };
}

function computeA11ySnapshot() {
    const images = [...document.querySelectorAll("img")];
    const missingAlt = images.filter((img) => !img.hasAttribute("alt") || img.getAttribute("alt") === "");

    const textElements = [...document.querySelectorAll("body *")]
        .filter((node) => node.childElementCount === 0 && node.textContent && node.textContent.trim().length > 2)
        .slice(0, 300);

    let lowContrastCount = 0;
    const lowContrastSamples = [];
    for (const node of textElements) {
        const style = getComputedStyle(node);
        const ratio = contrastRatio(style.color, getEffectiveBackgroundColor(node));
        if (ratio < 4.5) {
            lowContrastCount += 1;
            if (lowContrastSamples.length < 12) {
                const text = (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
                lowContrastSamples.push(
                    `${text || "(no text)"} (contrast ${ratio.toFixed(2)}:1)`
                );
            }
        }
    }

    const headingTree = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
        .slice(0, 40)
        .map((heading) => `${heading.tagName.toLowerCase()}: ${heading.textContent.trim().slice(0, 60)}`);

    return {
        missingAltCount: missingAlt.length,
        missingAltSamples: missingAlt.slice(0, 8).map((img) => img.currentSrc || img.src || "(inline image)"),
        lowContrastCount,
        lowContrastSamples,
        headingTree
    };
}

async function computePerfSnapshot() {
    try {
        const domNodes = document.getElementsByTagName("*").length;
        const resourceEntries = typeof performance?.getEntriesByType === "function"
            ? (performance.getEntriesByType("resource") || [])
            : [];

        const normalizeUrl = (value) => {
            try {
                const url = new URL(value, location.href);
                url.hash = "";
                return url.href;
            } catch (_error) {
                return value || "";
            }
        };

        const bytesFromEntry = (entry) => {
            if (!entry) {
                return null;
            }

            const transfer = Number(entry.transferSize || 0);
            if (transfer > 0) {
                return transfer;
            }

            const encoded = Number(entry.encodedBodySize || 0);
            if (encoded > 0) {
                return encoded;
            }

            const decoded = Number(entry.decodedBodySize || 0);
            if (decoded > 0) {
                return decoded;
            }

            return null;
        };

        const resourceIndex = new Map();
        for (const resource of resourceEntries) {
            const key = normalizeUrl(resource.name);
            if (!resourceIndex.has(key)) {
                resourceIndex.set(key, resource);
            }
        }

        const transferBytes = resourceEntries.reduce((sum, entry) => {
            const value = entry.transferSize || entry.encodedBodySize || 0;
            return sum + value;
        }, 0);

        const htmlBytes = (document.documentElement?.outerHTML || "").length * 2;
        const pageWeightKb = Math.round((transferBytes + htmlBytes) / 1024);

        const externalScriptUrls = [...document.querySelectorAll("script[src]")].filter((script) => {
            try {
                return new URL(script.src, location.href).origin !== location.origin;
            } catch (_error) {
                return false;
            }
        }).map((script) => script.src);

        const uniqueExternalScripts = [...new Set(externalScriptUrls)].slice(0, 20);
        const parseLength = (value) => {
            const parsed = Number.parseInt(String(value || ""), 10);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        };

        const probeContentLength = async (url) => {
            try {
                const headResponse = await fetch(url, {
                    method: "HEAD",
                    cache: "no-store",
                    credentials: "omit"
                });
                const headLength = parseLength(headResponse.headers.get("content-length"));
                if (headLength !== null) {
                    return headLength;
                }
            } catch (_error) {
                // Continue to range request fallback.
            }

            try {
                const rangeResponse = await fetch(url, {
                    method: "GET",
                    cache: "no-store",
                    credentials: "omit",
                    headers: { Range: "bytes=0-0" }
                });

                const contentRange = rangeResponse.headers.get("content-range");
                if (contentRange) {
                    const match = contentRange.match(/\/(\d+)\s*$/);
                    const totalLength = parseLength(match?.[1]);
                    if (totalLength !== null) {
                        return totalLength;
                    }
                }

                return parseLength(rangeResponse.headers.get("content-length"));
            } catch (_error) {
                return null;
            }
        };

        const externalScripts = await Promise.all(uniqueExternalScripts.map(async (url) => {
            const normalizedUrl = normalizeUrl(url);
            const entry = resourceIndex.get(normalizedUrl)
                || resourceEntries.find((resource) => normalizeUrl(resource.name) === normalizedUrl);
            let bytes = bytesFromEntry(entry);
            if (bytes === null) {
                bytes = await probeContentLength(normalizedUrl);
            }

            return {
                url: normalizedUrl,
                sizeKb: bytes === null ? null : Math.max(1, Math.ceil(bytes / 1024))
            };
        }));

        const largeImages = [...document.querySelectorAll("img")]
            .map((img) => {
                const src = img.currentSrc || img.src;
                if (!src) {
                    return null;
                }

                const normalizedSrc = normalizeUrl(src);
                const entry = resourceIndex.get(normalizedSrc)
                    || resourceEntries.find((resource) => normalizeUrl(resource.name) === normalizedSrc);
                const bytes = bytesFromEntry(entry);
                const largeBySize = bytes !== null && bytes > 200 * 1024;
                const largeByDimension = img.naturalWidth > 2000 || img.naturalHeight > 2000;

                if (!largeBySize && !largeByDimension) {
                    return null;
                }

                const sizeText = bytes === null ? "size unavailable" : `${Math.round(bytes / 1024)}KB`;
                return {
                    url: src,
                    label: `${src.slice(0, 72)}${src.length > 72 ? "..." : ""}`,
                    sizeText
                };
            })
            .filter(Boolean)
            .slice(0, 10);

        const headScripts = document.head ? [...document.head.querySelectorAll("script")] : [];
        const blockingHeadScripts = headScripts
            .filter((script) => script.src && !script.hasAttribute("defer") && !script.hasAttribute("async") && script.type !== "module")
            .map((script) => script.src)
            .slice(0, 10);

        return {
            domNodes,
            pageWeightKb,
            externalScripts,
            largeImages,
            blockingHeadScripts
        };
    } catch (error) {
        return {
            domNodes: 0,
            pageWeightKb: 0,
            externalScripts: [],
            largeImages: [],
            blockingHeadScripts: [],
            error: error?.message || String(error)
        };
    }
}

async function listIndexedDb() {
    if (typeof indexedDB.databases !== "function") {
        return [{ name: "indexedDB.databases() not supported", version: "-" }];
    }

    try {
        const dbs = await indexedDB.databases();
        return dbs.map((db) => ({
            name: db.name || "(unnamed)",
            version: db.version ?? "-"
        }));
    } catch (_error) {
        return [{ name: "Unable to enumerate IndexedDB", version: "-" }];
    }
}

function parseCookies() {
    if (!document.cookie) {
        return [];
    }

    return document.cookie.split("; ").map((part) => {
        const index = part.indexOf("=");
        const rawKey = index === -1 ? part : part.slice(0, index);
        const rawValue = index === -1 ? "" : part.slice(index + 1);

        return {
            key: decodeURIComponent(rawKey),
            value: decodeURIComponent(rawValue)
        };
    });
}

async function storageSnapshot() {
    const cookies = parseCookies().map((entry) => ({
        kind: "cookie",
        key: entry.key,
        value: entry.value,
        editable: true,
        deletable: true
    }));

    const localItems = Object.keys(localStorage).map((key) => ({
        kind: "localStorage",
        key,
        value: localStorage.getItem(key) || "",
        editable: true,
        deletable: true
    }));

    const sessionItems = Object.keys(sessionStorage).map((key) => ({
        kind: "sessionStorage",
        key,
        value: sessionStorage.getItem(key) || "",
        editable: true,
        deletable: true
    }));

    const indexedDb = await listIndexedDb();
    const indexedDbItems = indexedDb.map((db) => ({
        kind: "indexedDB",
        key: db.name,
        value: `version: ${db.version}`,
        editable: false,
        deletable: true
    }));

    return {
        items: [...cookies, ...localItems, ...sessionItems, ...indexedDbItems]
    };
}

function storageSet(kind, key, value) {
    if (kind === "cookie") {
        document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; path=/`;
        return;
    }

    if (kind === "localStorage") {
        localStorage.setItem(key, value);
        return;
    }

    if (kind === "sessionStorage") {
        sessionStorage.setItem(key, value);
    }
}

async function storageDelete(kind, key) {
    if (kind === "cookie") {
        document.cookie = `${encodeURIComponent(key)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        return;
    }

    if (kind === "localStorage") {
        localStorage.removeItem(key);
        return;
    }

    if (kind === "sessionStorage") {
        sessionStorage.removeItem(key);
        return;
    }

    if (kind === "indexedDB") {
        await new Promise((resolve) => {
            const request = indexedDB.deleteDatabase(key);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
        });
    }
}

function toggleCssTool(tool) {
    state.toolActive[tool] = !state.toolActive[tool];
    const active = state.toolActive[tool];

    if (tool === "zIndex") {
        toggleZIndex(active);
    } else if (tool === "overflow") {
        toggleOverflow(active);
    } else if (tool === "layout") {
        toggleLayout(active);
    } else if (tool === "darkMode") {
        toggleDarkMode(active);
    } else if (tool === "noAnimations") {
        toggleNoAnimations(active);
    } else if (tool === "noImages") {
        toggleNoImages(active);
    } else if (tool === "forceHover") {
        toggleForceHover(active);
    }

    return { active };
}

ext.runtime.onMessage.addListener((request) => {
    if (request.action === "seo-snapshot") {
        return Promise.resolve(computeSeoSnapshot());
    }

    if (request.action === "a11y-snapshot") {
        return Promise.resolve(computeA11ySnapshot());
    }

    if (request.action === "perf-snapshot") {
        return Promise.resolve(computePerfSnapshot());
    }

    if (request.action === "storage-snapshot") {
        return storageSnapshot();
    }

    if (request.action === "storage-set") {
        storageSet(request.kind, request.key, request.value);
        return Promise.resolve({ ok: true });
    }

    if (request.action === "storage-delete") {
        return storageDelete(request.kind, request.key).then(() => ({ ok: true }));
    }

    if (request.action === "css-tool-toggle") {
        return Promise.resolve(toggleCssTool(request.tool));
    }

    if (request.action === "a11y-color-filter") {
        return Promise.resolve(setColorBlindFilter(request.filter));
    }

    if (request.action === "a11y-aria-inspector") {
        return Promise.resolve(setAriaInspectorEnabled(request.enabled));
    }

    if (request.action === "rendering-format") {
        return Promise.resolve(setImageFormatDisabled(request.format, request.disable));
    }

    if (request.action === "prefers-color-scheme") {
        return Promise.resolve(setPrefersColorSchemeEmulation(request.value));
    }

    return undefined;
});
