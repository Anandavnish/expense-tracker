# Bank & Issuer Logos Registry

This document lists all local bank and card issuer brand mark assets stored under `app/assets/logos/`.
All assets are local-first, transparent ~256x256 PNGs isolated to each brand's square symbol/mark (no full wordmarks), sourced exclusively from Wikimedia Commons or official brand websites.

| Preset Code / ID | Asset File | Brand Name | Format & Dimensions | Source URL |
| :--- | :--- | :--- | :--- | :--- |
| `SBI` | `app/assets/logos/sbi.png` | State Bank of India | 256x256 Transparent PNG | [Wikimedia Commons: SBI-logo.svg](https://commons.wikimedia.org/wiki/File:SBI-logo.svg) |
| `SBI Card` | `app/assets/logos/sbi_card.png` | SBI Card | 256x256 Transparent PNG | [Wikimedia Commons: SBI Card logo.svg](https://commons.wikimedia.org/wiki/File:SBI_Card_logo.svg) |
| `HDFC` | `app/assets/logos/hdfc.png` | HDFC Bank | 256x256 Transparent PNG | [Wikimedia Commons: HDFC Bank Logo.svg](https://commons.wikimedia.org/wiki/File:HDFC_Bank_Logo.svg) |
| `Canara` | `app/assets/logos/canara.png` | Canara Bank | 256x256 Transparent PNG | [Wikimedia Commons: Canara Bank Logo.svg](https://commons.wikimedia.org/wiki/File:Canara_Bank_Logo.svg) |
| `PNB` | `app/assets/logos/pnb.png` | Punjab National Bank | 256x256 Transparent PNG | [Wikimedia Commons: Punjab National Bank new logo.svg](https://commons.wikimedia.org/wiki/File:Punjab_National_Bank_new_logo.svg) |
| `BOB` | `app/assets/logos/bob.png` | Bank of Baroda (Baroda Sun) | 256x256 Transparent PNG | [Wikimedia Commons: Bank of Baroda Logo since Dec 19.png](https://commons.wikimedia.org/wiki/File:Bank_of_Baroda_Logo_since_Dec_19.png) |
| `ICICI` | `app/assets/logos/icici.png` | ICICI Bank (Flame Symbol) | 256x256 Transparent PNG | [Wikimedia Commons: ICICI Bank Logo.svg](https://commons.wikimedia.org/wiki/File:ICICI_Bank_Logo.svg) |
| `Axis` | `app/assets/logos/axis.png` | Axis Bank (Pyramid Mark) | 256x256 Transparent PNG | [Wikimedia Commons: Axis Bank logo.svg](https://commons.wikimedia.org/wiki/File:Axis_Bank_logo.svg) |
| `Kotak` | `app/assets/logos/kotak.png` | Kotak Mahindra Bank | 256x256 Transparent PNG | [Wikipedia: Kotak Mahindra Bank logo.svg](https://en.wikipedia.org/wiki/File:Kotak_Mahindra_Bank_logo.svg) |
| `India Post` / `IPPB` | `app/assets/logos/ippb.png` | India Post Payments Bank | 256x256 Transparent PNG | [Wikipedia: India Post Payments Bank logo.png](https://en.wikipedia.org/wiki/File:India_Post_Payments_Bank_logo.png) |
| `Slice` | `app/assets/logos/slice.png` | Slice (GaragePreneurs / Slice SFB) | 256x256 Transparent PNG | [Slice Official Website](https://www.sliceit.com/) / [Wikimedia Commons: Slice SFB Logo.png](https://commons.wikimedia.org/wiki/File:Slice_SFB_Logo.png) |
| `Fino` | `app/assets/logos/fino.png` | Fino Payments Bank | 256x256 Transparent PNG | [Fino Payments Bank Official](https://www.finobank.com/) |
| `OneCard` | `app/assets/logos/onecard.png` | OneCard (FPL Technologies) | 256x256 Transparent PNG | [OneCard Official Website](https://www.getonecard.app/) |

## Note on Usage & Guidelines
- No live logo APIs are used. All assets are bundled statically into the application binary for fast offline rendering.
- Metro bundler statically resolves every image asset via `src/constants/logoRegistry.ts` (or `src/utils/logoRegistry.ts`).
- Logos are rendered inside `<BankLogo />` with neutral light tile background token `logoTileBackground`.
- Custom accounts and presets without matching marks gracefully fallback to a high-contrast initials avatar.
