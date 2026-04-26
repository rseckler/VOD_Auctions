/**
 * ISO-3166-1 alpha-2 Länder-Referenz für Admin-UI Country-Picker (rc51.1 R4).
 *
 * Enthält 249 canonical Codes mit:
 * - code: 2-stelliger ISO-Code (UPPERCASE)
 * - nameEn: Englischer Name (primär, konsistent mit Meili country_code)
 * - nameDe: Deutscher Name (für Admin-Search-Aliases, Frank arbeitet deutsch)
 * - flag: Unicode Flag-Emoji via Regional-Indicator-Symbols
 *
 * Generiert aus ISO-3166-1 (2020-revision) + scripts/data/country_iso.py.
 * Für neue Länder (oder wenn ISO sich ändert): hier manuell ergänzen.
 */

/** Regional-Indicator-Symbols kombinieren zu Flag-Emoji (z.B. "DE" → "🇩🇪"). */
export function flagFor(code: string): string {
  if (code.length !== 2) return ""
  const cp = [...code.toUpperCase()].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65))
  return String.fromCodePoint(...cp)
}

export type IsoCountry = {
  code: string
  nameEn: string
  nameDe: string
}

/**
 * ISO-3166-1 alpha-2 Liste (249 Entries).
 * Quelle: ISO Online Browsing Platform (ISO 3166-1).
 */
export const ISO_COUNTRIES: IsoCountry[] = [
  { code: "AD", nameEn: "Andorra", nameDe: "Andorra" },
  { code: "AE", nameEn: "United Arab Emirates", nameDe: "Vereinigte Arabische Emirate" },
  { code: "AF", nameEn: "Afghanistan", nameDe: "Afghanistan" },
  { code: "AG", nameEn: "Antigua and Barbuda", nameDe: "Antigua und Barbuda" },
  { code: "AI", nameEn: "Anguilla", nameDe: "Anguilla" },
  { code: "AL", nameEn: "Albania", nameDe: "Albanien" },
  { code: "AM", nameEn: "Armenia", nameDe: "Armenien" },
  { code: "AO", nameEn: "Angola", nameDe: "Angola" },
  { code: "AQ", nameEn: "Antarctica", nameDe: "Antarktis" },
  { code: "AR", nameEn: "Argentina", nameDe: "Argentinien" },
  { code: "AS", nameEn: "American Samoa", nameDe: "Amerikanisch-Samoa" },
  { code: "AT", nameEn: "Austria", nameDe: "Österreich" },
  { code: "AU", nameEn: "Australia", nameDe: "Australien" },
  { code: "AW", nameEn: "Aruba", nameDe: "Aruba" },
  { code: "AX", nameEn: "Åland Islands", nameDe: "Åland" },
  { code: "AZ", nameEn: "Azerbaijan", nameDe: "Aserbaidschan" },
  { code: "BA", nameEn: "Bosnia and Herzegovina", nameDe: "Bosnien und Herzegowina" },
  { code: "BB", nameEn: "Barbados", nameDe: "Barbados" },
  { code: "BD", nameEn: "Bangladesh", nameDe: "Bangladesch" },
  { code: "BE", nameEn: "Belgium", nameDe: "Belgien" },
  { code: "BF", nameEn: "Burkina Faso", nameDe: "Burkina Faso" },
  { code: "BG", nameEn: "Bulgaria", nameDe: "Bulgarien" },
  { code: "BH", nameEn: "Bahrain", nameDe: "Bahrain" },
  { code: "BI", nameEn: "Burundi", nameDe: "Burundi" },
  { code: "BJ", nameEn: "Benin", nameDe: "Benin" },
  { code: "BL", nameEn: "Saint Barthélemy", nameDe: "Saint-Barthélemy" },
  { code: "BM", nameEn: "Bermuda", nameDe: "Bermuda" },
  { code: "BN", nameEn: "Brunei Darussalam", nameDe: "Brunei" },
  { code: "BO", nameEn: "Bolivia", nameDe: "Bolivien" },
  { code: "BQ", nameEn: "Bonaire, Sint Eustatius and Saba", nameDe: "Bonaire, Sint Eustatius und Saba" },
  { code: "BR", nameEn: "Brazil", nameDe: "Brasilien" },
  { code: "BS", nameEn: "Bahamas", nameDe: "Bahamas" },
  { code: "BT", nameEn: "Bhutan", nameDe: "Bhutan" },
  { code: "BV", nameEn: "Bouvet Island", nameDe: "Bouvetinsel" },
  { code: "BW", nameEn: "Botswana", nameDe: "Botswana" },
  { code: "BY", nameEn: "Belarus", nameDe: "Belarus" },
  { code: "BZ", nameEn: "Belize", nameDe: "Belize" },
  { code: "CA", nameEn: "Canada", nameDe: "Kanada" },
  { code: "CC", nameEn: "Cocos (Keeling) Islands", nameDe: "Kokosinseln" },
  { code: "CD", nameEn: "Congo (Democratic Republic)", nameDe: "Kongo, Demokratische Republik" },
  { code: "CF", nameEn: "Central African Republic", nameDe: "Zentralafrikanische Republik" },
  { code: "CG", nameEn: "Congo", nameDe: "Kongo" },
  { code: "CH", nameEn: "Switzerland", nameDe: "Schweiz" },
  { code: "CI", nameEn: "Côte d'Ivoire", nameDe: "Elfenbeinküste" },
  { code: "CK", nameEn: "Cook Islands", nameDe: "Cookinseln" },
  { code: "CL", nameEn: "Chile", nameDe: "Chile" },
  { code: "CM", nameEn: "Cameroon", nameDe: "Kamerun" },
  { code: "CN", nameEn: "China", nameDe: "China" },
  { code: "CO", nameEn: "Colombia", nameDe: "Kolumbien" },
  { code: "CR", nameEn: "Costa Rica", nameDe: "Costa Rica" },
  { code: "CU", nameEn: "Cuba", nameDe: "Kuba" },
  { code: "CV", nameEn: "Cabo Verde", nameDe: "Kap Verde" },
  { code: "CW", nameEn: "Curaçao", nameDe: "Curaçao" },
  { code: "CX", nameEn: "Christmas Island", nameDe: "Weihnachtsinsel" },
  { code: "CY", nameEn: "Cyprus", nameDe: "Zypern" },
  { code: "CZ", nameEn: "Czechia", nameDe: "Tschechien" },
  { code: "DE", nameEn: "Germany", nameDe: "Deutschland" },
  { code: "DJ", nameEn: "Djibouti", nameDe: "Dschibuti" },
  { code: "DK", nameEn: "Denmark", nameDe: "Dänemark" },
  { code: "DM", nameEn: "Dominica", nameDe: "Dominica" },
  { code: "DO", nameEn: "Dominican Republic", nameDe: "Dominikanische Republik" },
  { code: "DZ", nameEn: "Algeria", nameDe: "Algerien" },
  { code: "EC", nameEn: "Ecuador", nameDe: "Ecuador" },
  { code: "EE", nameEn: "Estonia", nameDe: "Estland" },
  { code: "EG", nameEn: "Egypt", nameDe: "Ägypten" },
  { code: "EH", nameEn: "Western Sahara", nameDe: "Westsahara" },
  { code: "ER", nameEn: "Eritrea", nameDe: "Eritrea" },
  { code: "ES", nameEn: "Spain", nameDe: "Spanien" },
  { code: "ET", nameEn: "Ethiopia", nameDe: "Äthiopien" },
  { code: "FI", nameEn: "Finland", nameDe: "Finnland" },
  { code: "FJ", nameEn: "Fiji", nameDe: "Fidschi" },
  { code: "FK", nameEn: "Falkland Islands", nameDe: "Falklandinseln" },
  { code: "FM", nameEn: "Micronesia", nameDe: "Mikronesien" },
  { code: "FO", nameEn: "Faroe Islands", nameDe: "Färöer" },
  { code: "FR", nameEn: "France", nameDe: "Frankreich" },
  { code: "GA", nameEn: "Gabon", nameDe: "Gabun" },
  { code: "GB", nameEn: "United Kingdom", nameDe: "Vereinigtes Königreich" },
  { code: "GD", nameEn: "Grenada", nameDe: "Grenada" },
  { code: "GE", nameEn: "Georgia", nameDe: "Georgien" },
  { code: "GF", nameEn: "French Guiana", nameDe: "Französisch-Guayana" },
  { code: "GG", nameEn: "Guernsey", nameDe: "Guernsey" },
  { code: "GH", nameEn: "Ghana", nameDe: "Ghana" },
  { code: "GI", nameEn: "Gibraltar", nameDe: "Gibraltar" },
  { code: "GL", nameEn: "Greenland", nameDe: "Grönland" },
  { code: "GM", nameEn: "Gambia", nameDe: "Gambia" },
  { code: "GN", nameEn: "Guinea", nameDe: "Guinea" },
  { code: "GP", nameEn: "Guadeloupe", nameDe: "Guadeloupe" },
  { code: "GQ", nameEn: "Equatorial Guinea", nameDe: "Äquatorialguinea" },
  { code: "GR", nameEn: "Greece", nameDe: "Griechenland" },
  { code: "GS", nameEn: "South Georgia and the South Sandwich Islands", nameDe: "Südgeorgien und die Südlichen Sandwichinseln" },
  { code: "GT", nameEn: "Guatemala", nameDe: "Guatemala" },
  { code: "GU", nameEn: "Guam", nameDe: "Guam" },
  { code: "GW", nameEn: "Guinea-Bissau", nameDe: "Guinea-Bissau" },
  { code: "GY", nameEn: "Guyana", nameDe: "Guyana" },
  { code: "HK", nameEn: "Hong Kong", nameDe: "Hongkong" },
  { code: "HM", nameEn: "Heard Island and McDonald Islands", nameDe: "Heard und McDonaldinseln" },
  { code: "HN", nameEn: "Honduras", nameDe: "Honduras" },
  { code: "HR", nameEn: "Croatia", nameDe: "Kroatien" },
  { code: "HT", nameEn: "Haiti", nameDe: "Haiti" },
  { code: "HU", nameEn: "Hungary", nameDe: "Ungarn" },
  { code: "ID", nameEn: "Indonesia", nameDe: "Indonesien" },
  { code: "IE", nameEn: "Ireland", nameDe: "Irland" },
  { code: "IL", nameEn: "Israel", nameDe: "Israel" },
  { code: "IM", nameEn: "Isle of Man", nameDe: "Isle of Man" },
  { code: "IN", nameEn: "India", nameDe: "Indien" },
  { code: "IO", nameEn: "British Indian Ocean Territory", nameDe: "Britisches Territorium im Indischen Ozean" },
  { code: "IQ", nameEn: "Iraq", nameDe: "Irak" },
  { code: "IR", nameEn: "Iran", nameDe: "Iran" },
  { code: "IS", nameEn: "Iceland", nameDe: "Island" },
  { code: "IT", nameEn: "Italy", nameDe: "Italien" },
  { code: "JE", nameEn: "Jersey", nameDe: "Jersey" },
  { code: "JM", nameEn: "Jamaica", nameDe: "Jamaika" },
  { code: "JO", nameEn: "Jordan", nameDe: "Jordanien" },
  { code: "JP", nameEn: "Japan", nameDe: "Japan" },
  { code: "KE", nameEn: "Kenya", nameDe: "Kenia" },
  { code: "KG", nameEn: "Kyrgyzstan", nameDe: "Kirgisistan" },
  { code: "KH", nameEn: "Cambodia", nameDe: "Kambodscha" },
  { code: "KI", nameEn: "Kiribati", nameDe: "Kiribati" },
  { code: "KM", nameEn: "Comoros", nameDe: "Komoren" },
  { code: "KN", nameEn: "Saint Kitts and Nevis", nameDe: "St. Kitts und Nevis" },
  { code: "KP", nameEn: "North Korea", nameDe: "Nordkorea" },
  { code: "KR", nameEn: "South Korea", nameDe: "Südkorea" },
  { code: "KW", nameEn: "Kuwait", nameDe: "Kuwait" },
  { code: "KY", nameEn: "Cayman Islands", nameDe: "Kaimaninseln" },
  { code: "KZ", nameEn: "Kazakhstan", nameDe: "Kasachstan" },
  { code: "LA", nameEn: "Laos", nameDe: "Laos" },
  { code: "LB", nameEn: "Lebanon", nameDe: "Libanon" },
  { code: "LC", nameEn: "Saint Lucia", nameDe: "St. Lucia" },
  { code: "LI", nameEn: "Liechtenstein", nameDe: "Liechtenstein" },
  { code: "LK", nameEn: "Sri Lanka", nameDe: "Sri Lanka" },
  { code: "LR", nameEn: "Liberia", nameDe: "Liberia" },
  { code: "LS", nameEn: "Lesotho", nameDe: "Lesotho" },
  { code: "LT", nameEn: "Lithuania", nameDe: "Litauen" },
  { code: "LU", nameEn: "Luxembourg", nameDe: "Luxemburg" },
  { code: "LV", nameEn: "Latvia", nameDe: "Lettland" },
  { code: "LY", nameEn: "Libya", nameDe: "Libyen" },
  { code: "MA", nameEn: "Morocco", nameDe: "Marokko" },
  { code: "MC", nameEn: "Monaco", nameDe: "Monaco" },
  { code: "MD", nameEn: "Moldova", nameDe: "Moldau" },
  { code: "ME", nameEn: "Montenegro", nameDe: "Montenegro" },
  { code: "MF", nameEn: "Saint Martin (French part)", nameDe: "Saint-Martin" },
  { code: "MG", nameEn: "Madagascar", nameDe: "Madagaskar" },
  { code: "MH", nameEn: "Marshall Islands", nameDe: "Marshallinseln" },
  { code: "MK", nameEn: "North Macedonia", nameDe: "Nordmazedonien" },
  { code: "ML", nameEn: "Mali", nameDe: "Mali" },
  { code: "MM", nameEn: "Myanmar", nameDe: "Myanmar" },
  { code: "MN", nameEn: "Mongolia", nameDe: "Mongolei" },
  { code: "MO", nameEn: "Macao", nameDe: "Macau" },
  { code: "MP", nameEn: "Northern Mariana Islands", nameDe: "Nördliche Marianen" },
  { code: "MQ", nameEn: "Martinique", nameDe: "Martinique" },
  { code: "MR", nameEn: "Mauritania", nameDe: "Mauretanien" },
  { code: "MS", nameEn: "Montserrat", nameDe: "Montserrat" },
  { code: "MT", nameEn: "Malta", nameDe: "Malta" },
  { code: "MU", nameEn: "Mauritius", nameDe: "Mauritius" },
  { code: "MV", nameEn: "Maldives", nameDe: "Malediven" },
  { code: "MW", nameEn: "Malawi", nameDe: "Malawi" },
  { code: "MX", nameEn: "Mexico", nameDe: "Mexiko" },
  { code: "MY", nameEn: "Malaysia", nameDe: "Malaysia" },
  { code: "MZ", nameEn: "Mozambique", nameDe: "Mosambik" },
  { code: "NA", nameEn: "Namibia", nameDe: "Namibia" },
  { code: "NC", nameEn: "New Caledonia", nameDe: "Neukaledonien" },
  { code: "NE", nameEn: "Niger", nameDe: "Niger" },
  { code: "NF", nameEn: "Norfolk Island", nameDe: "Norfolkinsel" },
  { code: "NG", nameEn: "Nigeria", nameDe: "Nigeria" },
  { code: "NI", nameEn: "Nicaragua", nameDe: "Nicaragua" },
  { code: "NL", nameEn: "Netherlands", nameDe: "Niederlande" },
  { code: "NO", nameEn: "Norway", nameDe: "Norwegen" },
  { code: "NP", nameEn: "Nepal", nameDe: "Nepal" },
  { code: "NR", nameEn: "Nauru", nameDe: "Nauru" },
  { code: "NU", nameEn: "Niue", nameDe: "Niue" },
  { code: "NZ", nameEn: "New Zealand", nameDe: "Neuseeland" },
  { code: "OM", nameEn: "Oman", nameDe: "Oman" },
  { code: "PA", nameEn: "Panama", nameDe: "Panama" },
  { code: "PE", nameEn: "Peru", nameDe: "Peru" },
  { code: "PF", nameEn: "French Polynesia", nameDe: "Französisch-Polynesien" },
  { code: "PG", nameEn: "Papua New Guinea", nameDe: "Papua-Neuguinea" },
  { code: "PH", nameEn: "Philippines", nameDe: "Philippinen" },
  { code: "PK", nameEn: "Pakistan", nameDe: "Pakistan" },
  { code: "PL", nameEn: "Poland", nameDe: "Polen" },
  { code: "PM", nameEn: "Saint Pierre and Miquelon", nameDe: "Saint-Pierre und Miquelon" },
  { code: "PN", nameEn: "Pitcairn Islands", nameDe: "Pitcairninseln" },
  { code: "PR", nameEn: "Puerto Rico", nameDe: "Puerto Rico" },
  { code: "PS", nameEn: "Palestine", nameDe: "Palästina" },
  { code: "PT", nameEn: "Portugal", nameDe: "Portugal" },
  { code: "PW", nameEn: "Palau", nameDe: "Palau" },
  { code: "PY", nameEn: "Paraguay", nameDe: "Paraguay" },
  { code: "QA", nameEn: "Qatar", nameDe: "Katar" },
  { code: "RE", nameEn: "Réunion", nameDe: "Réunion" },
  { code: "RO", nameEn: "Romania", nameDe: "Rumänien" },
  { code: "RS", nameEn: "Serbia", nameDe: "Serbien" },
  { code: "RU", nameEn: "Russia", nameDe: "Russland" },
  { code: "RW", nameEn: "Rwanda", nameDe: "Ruanda" },
  { code: "SA", nameEn: "Saudi Arabia", nameDe: "Saudi-Arabien" },
  { code: "SB", nameEn: "Solomon Islands", nameDe: "Salomonen" },
  { code: "SC", nameEn: "Seychelles", nameDe: "Seychellen" },
  { code: "SD", nameEn: "Sudan", nameDe: "Sudan" },
  { code: "SE", nameEn: "Sweden", nameDe: "Schweden" },
  { code: "SG", nameEn: "Singapore", nameDe: "Singapur" },
  { code: "SH", nameEn: "Saint Helena", nameDe: "St. Helena" },
  { code: "SI", nameEn: "Slovenia", nameDe: "Slowenien" },
  { code: "SJ", nameEn: "Svalbard and Jan Mayen", nameDe: "Svalbard und Jan Mayen" },
  { code: "SK", nameEn: "Slovakia", nameDe: "Slowakei" },
  { code: "SL", nameEn: "Sierra Leone", nameDe: "Sierra Leone" },
  { code: "SM", nameEn: "San Marino", nameDe: "San Marino" },
  { code: "SN", nameEn: "Senegal", nameDe: "Senegal" },
  { code: "SO", nameEn: "Somalia", nameDe: "Somalia" },
  { code: "SR", nameEn: "Suriname", nameDe: "Suriname" },
  { code: "SS", nameEn: "South Sudan", nameDe: "Südsudan" },
  { code: "ST", nameEn: "São Tomé and Príncipe", nameDe: "São Tomé und Príncipe" },
  { code: "SV", nameEn: "El Salvador", nameDe: "El Salvador" },
  { code: "SX", nameEn: "Sint Maarten (Dutch part)", nameDe: "Sint Maarten" },
  { code: "SY", nameEn: "Syria", nameDe: "Syrien" },
  { code: "SZ", nameEn: "Eswatini", nameDe: "Eswatini" },
  { code: "TC", nameEn: "Turks and Caicos Islands", nameDe: "Turks- und Caicosinseln" },
  { code: "TD", nameEn: "Chad", nameDe: "Tschad" },
  { code: "TF", nameEn: "French Southern Territories", nameDe: "Französische Süd- und Antarktisgebiete" },
  { code: "TG", nameEn: "Togo", nameDe: "Togo" },
  { code: "TH", nameEn: "Thailand", nameDe: "Thailand" },
  { code: "TJ", nameEn: "Tajikistan", nameDe: "Tadschikistan" },
  { code: "TK", nameEn: "Tokelau", nameDe: "Tokelau" },
  { code: "TL", nameEn: "Timor-Leste", nameDe: "Osttimor" },
  { code: "TM", nameEn: "Turkmenistan", nameDe: "Turkmenistan" },
  { code: "TN", nameEn: "Tunisia", nameDe: "Tunesien" },
  { code: "TO", nameEn: "Tonga", nameDe: "Tonga" },
  { code: "TR", nameEn: "Türkiye", nameDe: "Türkei" },
  { code: "TT", nameEn: "Trinidad and Tobago", nameDe: "Trinidad und Tobago" },
  { code: "TV", nameEn: "Tuvalu", nameDe: "Tuvalu" },
  { code: "TW", nameEn: "Taiwan", nameDe: "Taiwan" },
  { code: "TZ", nameEn: "Tanzania", nameDe: "Tansania" },
  { code: "UA", nameEn: "Ukraine", nameDe: "Ukraine" },
  { code: "UG", nameEn: "Uganda", nameDe: "Uganda" },
  { code: "UM", nameEn: "United States Minor Outlying Islands", nameDe: "Amerikanische Überseeinseln" },
  { code: "US", nameEn: "United States", nameDe: "Vereinigte Staaten" },
  { code: "UY", nameEn: "Uruguay", nameDe: "Uruguay" },
  { code: "UZ", nameEn: "Uzbekistan", nameDe: "Usbekistan" },
  { code: "VA", nameEn: "Vatican City", nameDe: "Vatikanstadt" },
  { code: "VC", nameEn: "Saint Vincent and the Grenadines", nameDe: "St. Vincent und die Grenadinen" },
  { code: "VE", nameEn: "Venezuela", nameDe: "Venezuela" },
  { code: "VG", nameEn: "British Virgin Islands", nameDe: "Britische Jungferninseln" },
  { code: "VI", nameEn: "U.S. Virgin Islands", nameDe: "Amerikanische Jungferninseln" },
  { code: "VN", nameEn: "Vietnam", nameDe: "Vietnam" },
  { code: "VU", nameEn: "Vanuatu", nameDe: "Vanuatu" },
  { code: "WF", nameEn: "Wallis and Futuna", nameDe: "Wallis und Futuna" },
  { code: "WS", nameEn: "Samoa", nameDe: "Samoa" },
  { code: "YE", nameEn: "Yemen", nameDe: "Jemen" },
  { code: "YT", nameEn: "Mayotte", nameDe: "Mayotte" },
  { code: "ZA", nameEn: "South Africa", nameDe: "Südafrika" },
  { code: "ZM", nameEn: "Zambia", nameDe: "Sambia" },
  { code: "ZW", nameEn: "Zimbabwe", nameDe: "Simbabwe" },
]

const CODE_SET = new Set(ISO_COUNTRIES.map((c) => c.code))

/** Prüft ob ein Code ein gültiger ISO-3166-1 alpha-2 Code ist. */
export function isValidIsoCode(code: string | null | undefined): boolean {
  if (!code) return false
  return CODE_SET.has(code.toUpperCase())
}

/** Lookup by code (case-insensitive). Returns undefined for unknown codes. */
export function findCountry(code: string | null | undefined): IsoCountry | undefined {
  if (!code) return undefined
  return ISO_COUNTRIES.find((c) => c.code === code.toUpperCase())
}

/**
 * Lookup by full country name (case-insensitive, EN or DE). Used to
 * normalize Discogs-API country strings ("France", "Germany", "United States")
 * into ISO-2 codes for storage. Returns undefined for unknown names.
 *
 * Common Discogs aliases handled inline: "UK"→GB, "USA"→US, "South Korea"→KR.
 */
export function findCountryByName(name: string | null | undefined): IsoCountry | undefined {
  if (!name) return undefined
  const q = name.trim().toLowerCase()
  if (!q) return undefined
  // 2-letter code first (Discogs sometimes returns ISO-2 directly)
  if (q.length === 2) {
    const byCode = findCountry(q)
    if (byCode) return byCode
  }
  // Common aliases used by Discogs
  const aliases: Record<string, string> = {
    "uk": "GB",
    "usa": "US",
    "south korea": "KR",
    "north korea": "KP",
    "russia": "RU",
    "vietnam": "VN",
    "ivory coast": "CI",
    "czech republic": "CZ",
    "macedonia": "MK",
    "burma": "MM",
  }
  if (aliases[q]) return findCountry(aliases[q])
  return ISO_COUNTRIES.find(
    (c) => c.nameEn.toLowerCase() === q || c.nameDe.toLowerCase() === q
  )
}

/** Formats "🇩🇪 Germany (DE)" — fallback to just the code if unknown. */
export function formatCountryLabel(code: string | null | undefined): string {
  if (!code) return ""
  const country = findCountry(code)
  const flag = flagFor(code)
  if (country) return `${flag} ${country.nameEn} (${country.code})`
  return `⚠️ ${code} (non-ISO)`
}

/** Fuzzy-Filter: sucht in code/nameEn/nameDe. */
export function filterCountries(query: string): IsoCountry[] {
  const q = query.trim().toLowerCase()
  if (!q) return ISO_COUNTRIES
  return ISO_COUNTRIES.filter(
    (c) =>
      c.code.toLowerCase().includes(q) ||
      c.nameEn.toLowerCase().includes(q) ||
      c.nameDe.toLowerCase().includes(q)
  )
}
