// Vite imports: a fragment as text (`?raw`) and a stylesheet for its side effect.
declare module '*.html?raw' {
  const html: string;
  export default html;
}
declare module '*.css';
