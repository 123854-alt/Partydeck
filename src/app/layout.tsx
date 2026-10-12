import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata={title:'PartyDeck — Game night together',description:'One lobby for your whole game night.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="nl"><body>{children}</body></html>}
