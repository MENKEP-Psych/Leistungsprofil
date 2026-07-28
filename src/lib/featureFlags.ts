// Zentrale Feature-Schalter.
//
// ZZT (Zahlen-Zeige-Test) ist auf Wunsch der Klinik überall ausgeblendet.
// Die Logik (src/components/ZZTTab.tsx, lookupZZT in normUtils, recalcZZT) und die
// Normen (src/data/zzt_normen.json) bleiben vollständig erhalten – nur die sichtbaren
// Oberflächen (Navigation, Profil, Befund, Normen-Verifizieren) sind ausgeblendet.
//
// Zum Wieder-Einblenden einfach auf `true` setzen – es sind keine weiteren Änderungen nötig.
export const ZZT_ENABLED = false;
