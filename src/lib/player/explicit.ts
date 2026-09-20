const MARKER =
  /\b(explicit|uncensored|parental\s*advisory|dirty(?:\s*version)?|nsfw|e\s*x\s*p\s*l\s*i\s*c\s*i\s*t)\b|\((?:explicit|dirty|uncensored)\)|\[(?:explicit|e|dirty)\]/i;

const CLEAN = /\b(clean(?:\s*version)?|radio\s*edit|edited|explicit\s*removed)\b|\(clean\)|\[clean\]/i;

const SWEARS =
  /\b(?:f(?:u|u+|\*+|u\*+)ck(?:ing|er|ed|s)?|shit(?:ty|s)?|bitch(?:es|y)?|ass(?:holes?|hats?)?|arse(?:holes?)?|dick(?:s|head)?|cocks?(?:suckers?)?|pussy|cunt(?:s)?|whore(?:s)?|sluts?|fag(?:s|got)?|nigg(?:a|as|er|ers)|motherfuck(?:er|ers|ing)?|goddamn|goddammit|bullshit|twat|wank(?:er)?|blowjob)\b/i;

const EXPLICIT_ARTISTS = new Set(
  [
    "n.w.a",
    "nwa",
    "eminem",
    "dr. dre",
    "dr dre",
    "snoop dogg",
    "snoop doggy dogg",
    "2pac",
    "tupac",
    "the notorious b.i.g.",
    "notorious b.i.g.",
    "biggie smalls",
    "ice cube",
    "eazy-e",
    "wu-tang clan",
    "dmx",
    "50 cent",
    "lil wayne",
    "tyler, the creator",
    "tyler the creator",
    "death grips",
    "kendrick lamar",
    "schoolboy q",
    "asap rocky",
    "a$ap rocky",
    "travis scott",
    "playboi carti",
    "xxxTentacion",
    "xxxtentacion",
    "jpegmafia",
    "danny brown",
    "earl sweatshirt",
    "brockhampton",
    "odd future",
    "d12",
    "three 6 mafia",
    "bone thugs-n-harmony",
    "tech n9ne",
    "hopsin",
    "denzel curry",
    "jpegmafia",
    "little simz",
    "run the jewels",
    "killer mike",
    "el-p",
    "slipknot",
    "marilyn manson",
    "cannibal corpse",
    "deicide",
    "body count",
    "rage against the machine",
  ].map((n) => n.toLowerCase()),
);

const EXPLICIT_ALBUMS = new Set(
  [
    "n.w.a|straight outta compton",
    "dr. dre|the chronic",
    "snoop dogg|doggystyle",
    "2pac|all eyez on me",
    "eminem|the marshall mathers lp",
    "eminem|the eminem show",
    "eminem|relapse",
    "eminem|the slim shady lp",
    "kendrick lamar|good kid, m.a.a.d city",
    "kendrick lamar|to pimp a butterfly",
    "kendrick lamar|damn.",
    "kendrick lamar|damn",
    "n.w.a|efil4zaggin",
    "ice cube|death certificate",
    "wu-tang clan|enter the wu-tang",
    "notorious b.i.g.|ready to die",
    "the notorious b.i.g.|ready to die",
    "50 cent|get rich or die tryin'",
    "lil wayne|tha carter ii",
    "lil wayne|tha carter iii",
    "tyler, the creator|igor",
    "tyler, the creator|call me if you get lost",
    "death grips|the money store",
    "madvillain|madvillainy",
    "run the jewels|rtj4",
  ].map((n) => n.toLowerCase()),
);

const RAPPY = /\b(hip-?hop|rap|trap|drill|grime|gangsta|horrorcore|death metal|black metal|hardcore|nu[ -]?metal)\b/i;

function fold(value: string) {
  return (value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function blobOf(parts: Array<string | undefined | null>) {
  return parts.filter(Boolean).join(" · ");
}

export type ExplicitBits = {
  explicit?: boolean;
  name?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  genre?: string;
  tags?: string[];
};

export function looksClean(bits: ExplicitBits) {
  return CLEAN.test(blobOf([bits.name, bits.title, bits.album, ...(bits.tags || [])]));
}

export function isExplicitContent(bits: ExplicitBits) {
  if (bits.explicit) return true;
  if (looksClean(bits)) return false;
  const title = blobOf([bits.name, bits.title, bits.album]);
  const artist = fold(bits.albumArtist || bits.artist || "");
  const album = fold(bits.album || "");
  if (MARKER.test(title) || MARKER.test((bits.tags || []).join(" "))) return true;
  if (SWEARS.test(title)) return true;
  if (album && EXPLICIT_ALBUMS.has(`${artist}|${album}`)) return true;
  if (artist && EXPLICIT_ARTISTS.has(artist)) {
    const genre = blobOf([bits.genre, ...(bits.tags || [])]);
    if (!genre || RAPPY.test(genre) || !genre.trim()) return true;
  }
  return false;
}

export function isExplicitTrack(track: ExplicitBits) {
  return isExplicitContent(track);
}

export function isExplicitAlbum(album: { title: string; artist: string; genre?: string; tags?: string[] }, tracks: ExplicitBits[]) {
  if (tracks.some((t) => isExplicitContent(t))) return true;
  return isExplicitContent({
    album: album.title,
    artist: album.artist,
    genre: album.genre,
    tags: album.tags,
  });
}
