'use client';
import { createContext, useEffect, useState } from 'react';
export const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState('light');
  useEffect(() => { const frame=requestAnimationFrame(()=>setTheme(localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')));return()=>cancelAnimationFrame(frame); }, []);
  useEffect(() => { document.documentElement.classList.remove('light','dark'); document.documentElement.classList.add(theme); localStorage.setItem('theme',theme); }, [theme]);
  return <ThemeContext.Provider value={{ theme, toggleTheme: () => setTheme((value) => value === 'light' ? 'dark' : 'light') }}>{children}</ThemeContext.Provider>;
}
