// ธีมสีตัวเครื่อง — พาสเทลระดับเดียวกัน ตัวหนังสือใช้สีเข้มในตระกูลเดียวกัน
export interface Theme { key: string; name: string; shell: string; chip: string; ink: string; /** ต้องปลดล็อกด้วยรหัส */ locked?: string; }

export const THEMES: Theme[] = [
  { key: 'peach', name: 'พีช', shell: '#F5C4B3', chip: '#FAECE7', ink: '#4A1B0C' },
  { key: 'mint', name: 'มิ้นต์', shell: '#9FE1CB', chip: '#E1F5EE', ink: '#04342C' },
  { key: 'gb', name: 'เกมบอย', shell: '#C9C7BB', chip: '#E6E4DA', ink: '#2C2C2A' },
  { key: 'sky', name: 'ฟ้า', shell: '#B5D4F4', chip: '#E6F1FB', ink: '#042C53' },
  { key: 'lilac', name: 'ไลแลค', shell: '#CECBF6', chip: '#EEEDFE', ink: '#26215C' },
  { key: 'lemon', name: 'มะนาว', shell: '#FAC775', chip: '#FAEEDA', ink: '#412402' },
  { key: 'sakura', name: 'ซากุระ', shell: '#F4C0D1', chip: '#FBEAF0', ink: '#4B1528' },
  { key: 'leaf', name: 'ใบตอง', shell: '#C0DD97', chip: '#EAF3DE', ink: '#173404' },
  { key: 'coral', name: 'ปะการัง', shell: '#F0997B', chip: '#FAECE7', ink: '#4A1B0C' },
  { key: 'teal', name: 'คราม', shell: '#5DCAA5', chip: '#E1F5EE', ink: '#04342C' },
  { key: 'cream', name: 'ครีม', shell: '#EFE6D2', chip: '#FBF7EE', ink: '#3D2B14' },
  { key: 'night', name: 'ราตรี', shell: '#444441', chip: '#D3D1C7', ink: '#1E1E1C' },
  { key: 'gold', name: 'ทองคำ ✦', shell: '#EF9F27', chip: '#FAEEDA', ink: '#412402', locked: 'gold' },
];

export function applyTheme(key: string) {
  const t = THEMES.find(x => x.key === key) ?? THEMES[0];
  const s = document.documentElement.style;
  s.setProperty('--shell', t.shell);
  s.setProperty('--chip', t.chip);
  s.setProperty('--ink', t.ink);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.shell);
  return t;
}
