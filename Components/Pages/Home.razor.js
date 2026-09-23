// Colour picker dragging, and PNG export.
//
// The picker areas are re-rendered by Blazor whenever the colour changes, so listeners live on
// the window and find their target through data-picker attributes rather than holding a node.

let picker = null;

export function initPicker(dotNet) {
    disposePicker();

    const state = { dotNet, kind: null, el: null, queued: null, frame: 0 };

    // Coalesce to one server call per animation frame; a drag fires far more moves than that.
    const flush = () => {
        state.frame = 0;
        const q = state.queued;
        state.queued = null;
        if (q) state.dotNet.invokeMethodAsync(q.method, ...q.args).catch(() => { });
    };

    const queue = (method, ...args) => {
        state.queued = { method, args };
        if (!state.frame) state.frame = requestAnimationFrame(flush);
    };

    const report = (event) => {
        const r = state.el.getBoundingClientRect();
        if (!r.width || !r.height) return;

        if (state.kind === 'sv') {
            queue('OnSvDrag', (event.clientX - r.left) / r.width, (event.clientY - r.top) / r.height);
            return;
        }

        // Ring: angle only. Screen angle runs clockwise from 12 o'clock; the gradient starts at
        // 3 o'clock and runs clockwise through magenta, so hue runs the other way.
        const dx = event.clientX - (r.left + r.width / 2);
        const dy = event.clientY - (r.top + r.height / 2);
        let screen = Math.atan2(dx, -dy) * 180 / Math.PI;
        if (screen < 0) screen += 360;

        queue('OnHueDrag', ((90 - screen + 360) % 360) / 360);
    };

    // Only the ring itself starts a hue drag - not the gap between it and the square inside.
    const onRing = (el, e) => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const dist = Math.hypot(dx, dy);
        const inner = parseFloat(el.getAttribute('data-inner')) || 0.72;
        return dist >= inner && dist <= 1;
    };

    const onDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;

        const el = e.target.closest?.('[data-picker]');
        if (!el) return;

        const kind = el.getAttribute('data-picker');
        if (kind === 'wheel' && !onRing(el, e)) return;

        state.el = el;
        state.kind = kind;
        report(e);
        e.preventDefault();
    };

    const onMove = (e) => {
        if (state.el) report(e);
    };

    const onUp = () => {
        state.el = null;
        state.kind = null;
    };

    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    picker = () => {
        window.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (state.frame) cancelAnimationFrame(state.frame);
    };
}

export function disposePicker() {
    if (picker) {
        picker();
        picker = null;
    }
}

// Rasterise the logo SVG to a PNG in the browser and hand it to the user as a download.
// The markup is built server-side from the current colours, so what is exported is exactly
// what is on screen.

export async function exportPng(svgMarkup, pixelWidth, pixelHeight, filename) {
    const svgUrl = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }));

    try {
        const img = new Image();
        img.decoding = 'sync';

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('the browser could not decode the SVG'));
            img.src = svgUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, pixelWidth, pixelHeight);

        const png = await new Promise((resolve, reject) => {
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas produced no image')), 'image/png');
        });

        const href = URL.createObjectURL(png);
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();

        // Chrome needs the blob to outlive the click; revoking immediately cancels the download.
        setTimeout(() => URL.revokeObjectURL(href), 60000);

        return png.size;
    } finally {
        URL.revokeObjectURL(svgUrl);
    }
}
