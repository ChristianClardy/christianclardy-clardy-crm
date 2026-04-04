import { createContext, useContext, useEffect, useState } from "react";
import { applyColorScheme, getStoredColorScheme } from "./colorSchemes";

const ThemeContext = createContext({
  theme: "light",
  toggleTheme: () => {},
  colorScheme: "amber",
  setColorScheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("crm-theme") || "light");
  const [colorScheme, setColorSchemeState] = useState(getStoredColorScheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("crm-theme", theme);
  }, [theme]);

  useEffect(() => {
    applyColorScheme(colorScheme);
  }, [colorScheme]);

  const toggleTheme = () => setTheme(t => (t === "light" ? "dark" : "light"));
  const setColorScheme = (id) => setColorSchemeState(id);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colorScheme, setColorScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
