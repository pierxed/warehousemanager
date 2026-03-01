# Warehouse Manager — Test Checklist

Versione base test manuali per evitare regressioni dopo modifiche.

---

## ✅ 1. Avvio applicazione

* [ ] Dashboard si apre senza errori console
* [ ] KPI caricati correttamente
* [ ] Nessun loader infinito

---

## ✅ 2. Prodotti

* [ ] Creazione nuovo prodotto funziona
* [ ] Modifica prodotto salva correttamente
* [ ] Archivia prodotto → sparisce con "Solo attivi" ON
* [ ] Ripristina prodotto → ricompare
* [ ] Immagine prodotto caricata correttamente

---

## ✅ 3. Produzione

* [ ] Scan EAN trova prodotto
* [ ] Lotto esistente viene riutilizzato
* [ ] Lotto nuovo viene creato
* [ ] Movimento PRODUCTION registrato
* [ ] Stock aumenta correttamente

---

## ✅ 4. Vendita

* [ ] Preview vendita mostra allocazione FEFO
* [ ] Commit vendita scala stock
* [ ] Stock non va mai sotto zero
* [ ] Movimenti SALE salvati

---

## ✅ 5. Aggiustamento stock

* [ ] IN aumenta stock
* [ ] OUT diminuisce stock
* [ ] Motivazione salvata
* [ ] Movimento ADJUSTMENT creato

---

## ✅ 6. Magazzino — Filtri

* [ ] Search testo funziona
* [ ] Search EAN (8–14 cifre) funziona
* [ ] Ricerca lotto tipo "365.26" funziona
* [ ] Dropdown tipo pesce filtra correttamente
* [ ] Chip Scadenze funziona
* [ ] Chip Stock basso funziona
* [ ] Chip Stock 0 funziona
* [ ] Chip Solo attivi funziona (Prodotti)
* [ ] Chip Solo attivi funziona (Lotti)
* [ ] Chip Solo FEFO funziona
* [ ] Ordinamenti funzionano

---

## ✅ 7. Persistenza filtri

* [ ] Refresh pagina mantiene filtri Magazzino
* [ ] Cambio tab e ritorno mantiene filtri

---

## ✅ 8. Cache & aggiornamenti

* [ ] Archivia prodotto aggiorna subito Magazzino
* [ ] Produzione aggiorna stock senza refresh manuale
* [ ] Vendita aggiorna KPI

---

## ✅ 9. Mobile

* [ ] Nessun lag nella ricerca
* [ ] UI non rompe layout
* [ ] Chip cliccabili facilmente

---

## ✅ 10. Error handling

* [ ] API errore mostra messaggio
* [ ] Nessun blocco UI dopo errore

---

## Note

Segnare qui eventuali problemi trovati durante i test:

*
*
*
