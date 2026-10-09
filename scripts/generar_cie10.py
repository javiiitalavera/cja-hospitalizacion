#!/usr/bin/env python3
"""Genera public/cie10_es_2026.txt a partir de la Tabla de Referencia CIE-10-ES del Ministerio
de Sanidad (hoja "ES20xx Finales"). Uso, cada año al salir la edición nueva:

    python3 scripts/generar_cie10.py /ruta/Diagnosticos_Tabla_Referencia_CIE10ES_2026.xlsx 2026

Formato de salida: una línea por código final, "CODIGO|MARCAS|DESCRIPCIÓN".
Marcas: M = código de manifestación (nunca principal), N = no puede ser diagnóstico principal,
E = exento de POAD. Se excluyen los códigos solo perinatales, pediátricos u obstétricos.
Requiere: pip install openpyxl
"""
import sys
import openpyxl

ruta, anio = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else '2026'
libro = openpyxl.load_workbook(ruta, read_only=True)
hoja = next(h for h in libro.worksheets if h.title.endswith('Finales'))
n = 0
with open(f'public/cie10_es_{anio}.txt', 'w', encoding='utf-8') as out:
    for i, f in enumerate(hoja.iter_rows(values_only=True)):
        if i == 0:
            continue
        codigo, desc, _nodo, manif, peri, pedi, obst, _ad, _muj, _hom, exento, no_princ, _vcdp = f[:13]
        if peri or pedi or obst:
            continue
        marcas = ('M' if manif else '') + ('N' if no_princ else '') + ('E' if exento else '')
        out.write(f'{codigo}|{marcas}|{desc}\n')
        n += 1
print(n, 'códigos escritos en', f'public/cie10_es_{anio}.txt')
