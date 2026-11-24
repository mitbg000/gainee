/** Split pasted lines into cards: "term<sep>definition", one per line (Quizlet's import). */
export function parseImport(text: string, sep: "tab" | "comma" | "dash"): { term: string; meaningVi: string }[] {
  const re = sep === "tab" ? /\t/ : sep === "comma" ? /,/ : /\s+[-–—]\s+/;
  return text
    .split(/\r?\n/)
    .map((l) => {
      const [term, ...rest] = l.split(re);
      return { term: term?.trim() ?? "", meaningVi: rest.join(sep === "comma" ? "," : " - ").trim() };
    })
    .filter((c) => c.term);
}
