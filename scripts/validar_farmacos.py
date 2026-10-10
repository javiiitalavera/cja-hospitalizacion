#!/usr/bin/env python3
"""Comprueba src/lib/farmacos_atc.txt (catálogo de fármacos con su código ATC).

Uso:  python3 scripts/validar_farmacos.py [WHO_ATC.csv]

 · Avisa de líneas mal formadas y de nombres/marcas repetidos entre fármacos distintos
   (el buscador se quedaría con el primero).
 · Si se pasa el CSV de la OMS (columnas atc_code,atc_name,...), comprueba que cada código existe
   y que su nombre se parece al del catálogo (para cazar un código tecleado mal).

Para añadir un fármaco basta con una línea nueva:  ATC|Nombre|marca1,marca2|*   (el * es opcional: uso muy habitual)
"""
import csv, re, sys, unicodedata

def n(s):
    s = unicodedata.normalize('NFD', s.lower())
    return re.sub(r'[^a-z0-9]+', ' ', ''.join(c for c in s if not unicodedata.combining(c))).strip()

lineas = []
for i, l in enumerate(open('src/lib/farmacos_atc.txt', encoding='utf-8'), 1):
    l = l.rstrip('\n')
    if not l.strip() or l.startswith('#'):
        continue
    p = l.split('|')
    if len(p) < 2 or not re.match(r'^[A-Z]\d{2}[A-Z]{0,2}\d{0,2}$', p[0]) or not p[1].strip():
        print(f'línea {i}: mal formada: {l}'); continue
    lineas.append((i, p[0], p[1].strip(), [a.strip() for a in (p[2].split(',') if len(p) > 2 else []) if a.strip()]))

vistos = {}
for i, atc, nombre, alias in lineas:
    for k in [nombre] + alias:
        kk = n(k)
        if kk in vistos and vistos[kk][0] != atc:
            print(f'línea {i}: «{k}» ya está en {vistos[kk][0]} ({vistos[kk][1]})')
        vistos.setdefault(kk, (atc, nombre))

if len(sys.argv) > 1:
    who = {}
    for r in csv.DictReader(open(sys.argv[1], encoding='utf-8')):
        who.setdefault(r['atc_code'], r['atc_name'])
    def raiz(s):
        s = n(re.sub(r'\(.*?\)', '', s).split('/')[0])
        for a, b in [('ph', 'f'), ('th', 't'), ('y', 'i'), ('ll', 'l'), ('ci', 'si'), ('c', 'k'), ('qu', 'k'), ('z', 's'), ('x', 'k')]:
            s = s.replace(a, b)
        return s[:5]
    for i, atc, nombre, _ in lineas:
        if atc not in who:
            print(f'línea {i}: {atc} ({nombre}) no existe en la lista de la OMS')
        elif raiz(nombre) != raiz(who[atc]) and len(atc) == 7:
            print(f'línea {i}: {atc}: «{nombre}» vs OMS «{who[atc]}» (revisar si es el mismo fármaco)')
print(len(lineas), 'fármacos en el catálogo')
