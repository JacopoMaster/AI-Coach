// Shared "Multiverse Coach" roster — used by every push-notification cron.
// Random selection happens in TypeScript (not in the LLM prompt) to keep the
// distribution uniform: Haiku, left to its own devices, tends to favor the
// most-represented characters in its pre-training data.
//
// Each entry carries optional `tags`. The "waifu" tag flags female anime
// characters and powers the `amante_2d` achievement: every push delivered
// from a waifu-tagged coach increments user_stats.anime_waifu_notifs.

export interface Character {
  name: string
  tags: readonly string[]
}

export const COACH_ROSTER: readonly Character[] = [
  // One Piece
  { name: 'Monkey D. Rufy (One Piece)', tags: [] },
  { name: 'Roronoa Zoro (One Piece)', tags: [] },
  { name: 'Sanji (One Piece)', tags: [] },
  { name: 'Nami (One Piece)', tags: ['waifu'] },
  // Dragon Ball
  { name: 'Son Goku (Dragon Ball)', tags: [] },
  { name: 'Vegeta (Dragon Ball)', tags: [] },
  { name: 'Piccolo (Dragon Ball)', tags: [] },
  { name: 'Majin Buu (Dragon Ball)', tags: [] },
  { name: 'Mr. Satan (Dragon Ball)', tags: [] },
  // Naruto
  { name: 'Naruto Uzumaki (Naruto)', tags: [] },
  { name: 'Kakashi Hatake (Naruto)', tags: [] },
  { name: 'Sasuke Uchiha (Naruto)', tags: [] },
  // Bleach
  { name: 'Ichigo Kurosaki (Bleach)', tags: [] },
  { name: 'Kenpachi Zaraki (Bleach)', tags: [] },
  // JoJo
  { name: 'Jotaro Kujo (JoJo)', tags: [] },
  { name: 'Joseph Joestar (JoJo)', tags: [] },
  // L'Attacco dei Giganti
  { name: "Levi Ackerman (L'Attacco dei Giganti)", tags: [] },
  { name: "Eren Yeager (L'Attacco dei Giganti)", tags: [] },
  // My Hero Academia
  { name: 'All Might (My Hero Academia)', tags: [] },
  { name: 'Katsuki Bakugo (My Hero Academia)', tags: [] },
  { name: 'All for One (My Hero Academia)', tags: [] },
  // Hunter x Hunter
  { name: 'Gon Freecss (Hunter x Hunter)', tags: [] },
  { name: 'Hisoka (Hunter x Hunter)', tags: [] },
  // Gurren Lagann
  { name: 'Kamina (Gurren Lagann)', tags: [] },
  { name: 'Simon (Gurren Lagann)', tags: [] },
  // Gundam
  { name: 'Char Aznable (Gundam)', tags: [] },
  { name: 'Amuro Ray (Gundam)', tags: [] },
  // Invincible
  { name: 'Mark Grayson (Invincible)', tags: [] },
  { name: 'Atom eve (Invincible)', tags: [] },
  { name: 'Omniman (Invincible)', tags: [] },
  // Eureka Seven
  { name: 'Holland Novak (Eureka Seven)', tags: [] },
  { name: 'Renton Thurston (Eureka Seven)', tags: [] },
  { name: 'Eureka (Eureka Seven)', tags: ['waifu'] },
  // Evangelion
  { name: 'Asuka Langley (Evangelion)', tags: ['waifu'] },
  { name: 'Misato Katsuragi (Evangelion)', tags: ['waifu'] },
  { name: 'Shinji Ikari (Evangelion)', tags: [] },
  // Re:Zero
  { name: 'Subaru Natsuki (Re:Zero)', tags: [] },
  { name: 'Rem (Re:Zero)', tags: ['waifu'] },
  // Gintama
  { name: 'Sakata Gintoki (Gintama)', tags: [] },
  { name: 'Toshiro Hijikata (Gintama)', tags: [] },
  // Konosuba
  { name: 'Aqua (Konosuba)', tags: ['waifu'] },
  { name: 'Megumin (Konosuba)', tags: ['waifu'] },
  { name: 'Kazuma Sato (Konosuba)', tags: [] },
  // Lovely Complex
  { name: 'Risa Koizumi (Lovely Complex)', tags: ['waifu'] },
  // Toradora
  { name: 'Taiga Aisaka (Toradora)', tags: ['waifu'] },
  // Code Geass
  { name: 'Lelouch vi Britannia (Code Geass)', tags: [] },
  { name: 'Suzaku Kururugi (Code Geass)', tags: [] },
  // Mirai Nikki
  { name: 'Yuno Gasai (Mirai Nikki)', tags: ['waifu'] },
  // Final Fantasy
  { name: 'Cloud Strife (Final Fantasy VII)', tags: [] },
  { name: 'Sephiroth (Final Fantasy VII)', tags: [] },
  { name: 'Tidus (Final Fantasy X)', tags: [] },
  // Persona
  { name: 'Joker (Persona 5)', tags: [] },
  { name: 'Makoto Niijima (Persona 5)', tags: ['waifu'] },
  { name: 'Makoto Yuki (Persona 3)', tags: [] },
  // Kingdom Hearts
  { name: 'Sora (Kingdom Hearts)', tags: [] },
  { name: 'Riku (Kingdom Hearts)', tags: [] },
  // Nier
  { name: '2B (Nier Automata)', tags: ['waifu'] },
  { name: '9S (Nier Automata)', tags: [] },
  // Zelda
  { name: 'Link (The Legend of Zelda)', tags: [] },
  { name: 'Ganondorf (The Legend of Zelda)', tags: [] },
  // Yakuza
  { name: 'Kazuma Kiryu (Yakuza)', tags: [] },
  { name: 'Goro Majima (Yakuza)', tags: [] },
  { name: 'Ichiban Kasuga (Yakuza: Like a Dragon)', tags: [] },
  // Professor Layton
  { name: 'Professor Layton (Professor Layton)', tags: [] },
  { name: 'Luke Triton (Professor Layton)', tags: [] },
  // Rocky joe
  { name: 'Joe Yabuki (Rocky Joe)', tags: [] },
  // Star Wars
  { name: 'Yoda (Star Wars)', tags: [] },
]

export function pickRandomCharacter(): Character {
  return COACH_ROSTER[Math.floor(Math.random() * COACH_ROSTER.length)]
}

export function isWaifu(character: Character): boolean {
  return character.tags.includes('waifu')
}
