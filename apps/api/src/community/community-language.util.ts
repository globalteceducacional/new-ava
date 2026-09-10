import { HttpException, HttpStatus } from '@nestjs/common';

/** Código estável para o front abrir o pop-up (não gravar a mensagem). */
export const COMMUNITY_LANGUAGE_BLOCKED = 'COMMUNITY_LANGUAGE_BLOCKED';

const USER_MESSAGE =
  'Esta mensagem não foi publicada porque contém xingamentos ou linguagem imprópria para o ambiente escolar. Reescreva com respeito.';

/** Termos inteiros (já normalizados, sem acento). Só token completo — evita “curso” por causa de “cu”. */
const BLOCKED_WORDS = new Set([
  'porn',
  'porno',
  'pornografia',
  'pornografico',
  'pornografica',
  'putaria',
  'puta',
  'putas',
  'foder',
  'fode',
  'fodeu',
  'fodendo',
  'fodida',
  'fodido',
  'fodase',
  'foda',
  'fodasse',
  'transar',
  'transando',
  'transou',
  'boquete',
  'punheta',
  'punhetar',
  'siririca',
  'gozada',
  'tesao',
  'buceta',
  'xoxota',
  'pepeca',
  'pentelho',
  'piroca',
  'nudes',
  'nude',
  'nsfw',
  'onlyfans',
  'xvideos',
  'pornhub',
  'xhamster',
  'redtube',
  'camgirl',
  'xxx',
  'fuck',
  'fucking',
  'fucker',
  'pussy',
  'blowjob',
  'horny',
  'milf',
  'hentai',
  'incesto',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'motherfucker',
  'dumbass',
  'caralho',
  'caralhos',
  'caralhada',
  'porra',
  'porras',
  'merda',
  'merdas',
  'merdinha',
  'bosta',
  'bostas',
  'cacete',
  'caceta',
  'cuzao',
  'cuzaos',
  'arrombado',
  'arrombada',
  'arrombados',
  'arrombadas',
  'desgracado',
  'desgracada',
  'desgracados',
  'desgracadas',
  'desgraca',
  'vagabundo',
  'vagabunda',
  'otario',
  'otaria',
  'babaca',
  'imbecil',
  'estupido',
  'estupida',
  'corno',
  'corna',
  'cornos',
  'viado',
  'viados',
  'retardado',
  'retardada',
  'cu',
  'krl',
  'krlh',
  'kct',
  'pqp',
  'vsf',
  'vsfd',
  'fdp',
  'tnc',
  'vtnc',
  'pnc',
]);

const BLOCKED_PHRASES = [
  'conteudo adulto',
  'conteudo explicito',
  'only fans',
  'pack de nudes',
  'manda nudes',
  'filho da puta',
  'filha da puta',
  'puta que pariu',
  'vai se foder',
  'vai tomar no cu',
  'tomar no cu',
  'toma no cu',
  'pau no cu',
];

const BLOCKED_STEMS = ['porn', 'foder', 'fodid', 'caralh', 'arromb', 'desgracad'];

/**
 * Palavras curtas que NÃO podem ser buscadas no texto compacto inteiro
 * (ex.: “cu” em curso, “puta” em computador). Só valem como token ou como
 * sequência de letras isoladas (“p o r n o”).
 */
const COMPACT_SKIP = new Set([
  'cu',
  'xxx',
  'puta',
  'putas',
  'foda',
  'fode',
  'nude',
  'krl',
  'kct',
  'pqp',
  'vsf',
  'fdp',
  'tnc',
  'pnc',
]);

/** Lookalikes cirílicos/gregos → latino (homóglifos comuns). */
const HOMOGLYPH: Record<string, string> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  і: 'i',
  ѕ: 's',
  ԁ: 'd',
  ο: 'o',
  α: 'a',
  ρ: 'p',
  τ: 't',
  υ: 'y',
  κ: 'k',
};

function fold(raw: string): string {
  let s = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .toLowerCase();
  s = s.replace(/./gu, (ch) => HOMOGLYPH[ch] ?? ch);
  return s
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');
}

function collapseRepeats(token: string): string {
  return token.replace(/(.)\1{2,}/g, '$1$1');
}

function tokenIsBlocked(token: string): boolean {
  if (BLOCKED_WORDS.has(token)) return true;
  return BLOCKED_STEMS.some(
    (stem) => token.startsWith(stem) && token.length >= stem.length,
  );
}

/** True se o texto contém xingamento ou linguagem adulta/explícita. */
export function communityTextIsBlocked(text: string): boolean {
  const folded = fold(text);
  if (!folded.trim()) return false;

  const tokens = folded.split(/[^a-z]+/).filter(Boolean);
  for (const raw of tokens) {
    const token = collapseRepeats(raw);
    if (tokenIsBlocked(token)) return true;
  }

  // “p o r n o” / “p.o.r.n.o”: letras isoladas viram uma palavra.
  let run = '';
  const flushRun = (): boolean => {
    if (run.length < 3) return false;
    return tokenIsBlocked(collapseRepeats(run));
  };
  for (const raw of tokens) {
    if (raw.length === 1) {
      run += raw;
    } else {
      if (flushRun()) return true;
      run = '';
    }
  }
  if (flushRun()) return true;

  for (const phrase of BLOCKED_PHRASES) {
    if (folded.includes(phrase)) return true;
  }

  const compact = collapseRepeats(folded.replace(/[^a-z]+/g, ''));
  for (const word of BLOCKED_WORDS) {
    if (COMPACT_SKIP.has(word)) continue;
    if (word.length >= 5 && compact.includes(word)) return true;
  }

  return false;
}

export function assertCommunityLanguageClean(...parts: string[]): void {
  for (const part of parts) {
    if (communityTextIsBlocked(part)) {
      throw new HttpException(
        { code: COMMUNITY_LANGUAGE_BLOCKED, message: USER_MESSAGE },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
