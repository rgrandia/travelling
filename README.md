# 30 abans dels 30 🌍

Web de grup per apuntar els països que ha visitat cadascú i seguir el repte de **visitar 30 països abans de fer 30 anys**.

- Cada participant posa el **nom** i la **data de naixement**.
- Els països es marquen des d'un cercador o clicant el mapa, amb una **data de visita opcional**.
- El **rànquing** ordena per *ritme necessari*: països que falten ÷ anys que queden fins als 30.
- El **mapa del grup** mostra quants participants han visitat cada país.

## Regles de recompte

- La llista inclou els **250 països i territoris de l'ISO 3166-1** (els 193 estats de l'ONU més territoris com Groenlàndia, Hong Kong, Puerto Rico o Kosovo). Els que no són membres de l'ONU es marquen a la llista.
- Un país amb data igual o posterior al 30è aniversari **no compta**.
- Un país **sense data compta**, però es mostra com a "sense data". En aquest cas no es pot calcular la data exacta en què es va assolir el repte.

## Posada en marxa

### 1. Base de dades (Supabase, gratuït)

1. Crea un projecte a <https://supabase.com>.
2. Ves a **SQL Editor → New query**, enganxa el contingut de [`supabase/schema.sql`](supabase/schema.sql) i prem **Run**.
3. A **Project Settings → API**, copia el **Project URL** i la **anon public key**.
4. Posa'ls a [`config.js`](config.js).

La *anon key* és pública per disseny. **No hi posis mai la `service_role` key.**

### 2. Publicació (GitHub Pages)

Al repositori, ves a **Settings → Pages → Build and deployment**, tria *Deploy from a branch*, la branca `main` i la carpeta `/ (root)`. La web quedarà a `https://<usuari>.github.io/travelling/`.

### Sense configurar

Si `config.js` és buit, la web funciona en **mode demo**: les dades només es guarden al navegador de qui l'obre.

## Limitacions conegudes

- **Confiança total:** qualsevol persona amb l'enllaç pot editar o esborrar les dades de qualsevol participant. No hi ha historial per recuperar res.
- La data de naixement és visible indirectament (edat i data dels 30) per a tothom que tingui l'enllaç.
- Alguns microestats i illes (Tuvalu, Gibraltar, Martinica…) no surten al mapa a aquesta escala. Es poden afegir des del cercador.

## Fitxers

| Fitxer | Què fa |
|---|---|
| `index.html` | Estructura i plantilles |
| `app.js` | Lògica, càlculs, mapa i accés a dades |
| `styles.css` | Estils (clar/fosc, mòbil) |
| `countries.js` | Codis ISO, continent i bandera (de `world-countries@5.1.0`) |
| `config.js` | Claus de Supabase |
| `supabase/schema.sql` | Taules i permisos |
