// Self-contained JSX fixture: ampersands are literal unless they form an entity.
declare namespace JSX {
  interface IntrinsicElements { [name: string]: any; }
}

const jsxAmpersandLeft = 1;
const jsxAmpersandRight = 2;
const jsxAmpersandText = [
  <div>Privacy & Data</div>,
  <div>AT&T</div>,
  <div>&</div>,
  <div>A && B</div>,
  <div>{jsxAmpersandLeft} & {jsxAmpersandRight}</div>,
  <div>a &notareference b</div>,
  <div>trailing &</div>,
  <div>a &amp; b &#38; c &#x26; d</div>,
  <div>a &&amp; b</div>,
];
const jsxAmpersandAttributes = [
  <a href="https://fonts.googleapis.com/css2?family=A&family=B&display=block" />,
  <a href='https://example.test/?first=1&second=2' />,
  <a title="&" />,
  <a title='&' />,
  <a title="leading&" />,
  <a title='leading&' />,
  <a title="&unknown" />,
  <a title="A & B" />,
  <a title="&amp; &#38; &#x26;" />,
  <a title="&&amp;" />,
];
const jsxAmpersandOperators = jsxAmpersandLeft & jsxAmpersandRight;
const jsxAmpersandString = "A & B &amp;";
