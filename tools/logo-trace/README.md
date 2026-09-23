# Logo tracer

Regenerates the vector path data from the source artwork. Only needed if
`SrcImage/CoachCube_Full_Logo_Navy.png` changes — the generated output is
committed, so day-to-day work does not require Node.

```
cd tools/logo-trace
npm install
npm run build
```

## What it does

`trace.js` classifies every pixel of the source PNG to the nearest of the three
artwork colours (navy `#0C1A3B`, icon blue `#00A2F4`, white `#FAFAFA`), then:

- runs a connected-component pass over the icon's blue pixels, which yields
  exactly four separate shapes — ordered left to right they are the outer frame,
  the inner left panel, the inner right panel and the solid right half;
- takes all white pixels as "Coach" and the blue pixels right of x=800 as "Cube";
- traces each of those six masks separately with potrace.

It asserts the four icon parts come out in the expected left-to-right order and
nesting, and fails loudly rather than silently mislabelling them.

`emit.js` writes the results to:

- `LogoData.cs` — the path data the Blazor app renders
- `wwwroot/coachcube-logo.svg` — the same artwork as a plain standalone SVG

The background is not traced. It is emitted as a full-canvas rectangle painted
first, so every other section sits on top of it.
