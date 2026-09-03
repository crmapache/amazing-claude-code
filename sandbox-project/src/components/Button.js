// The component everybody means when they say "Button".
export function Button({ label, onClick }) {
  return `<button class="btn">${label}</button>` // onClick is wired by the caller
}
