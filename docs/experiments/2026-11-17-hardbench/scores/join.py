import json,sys,collections
r=sys.argv[1]
key=json.load(open('hardbench-run/key/outid_to_cell.json'))
sc=json.load(open(f'hardbench-score/{r}/scores.json'))
outs={}
import glob,os
for f in glob.glob('hardbench-run/blind2/outputs/*.json'):
    outs[os.path.basename(f)[:-5]]=json.load(open(f))
cells=['A1','A1r','A2','A2r','B2','A3']
T=collections.defaultdict(lambda:collections.Counter())
for s in sc:
    c=key[s['outid']]; c=c if isinstance(c,str) else c.get('cell')
    cl=s['class']; cl='K' if cl.lower().startswith('c') or cl=='K' else cl
    v=outs[s['outid']]['verdict']
    t=T[(c,cl)]; t['n']+=1
    if cl=='K':
        t['clean']+= v=='clean'
    else:
        t['found']+=bool(s.get('found')); t['r1']+= s.get('rank')==1
        t['g_'+str(s.get('grounded'))]+= bool(s.get('found'))
        t['vdefect']+= v=='defect'
print('cell  '+'  '.join(f'{c:>14}' for c in ['I','N','F','U','all28','K clean']))
for c in cells:
    row=[];tf=tg=tn=0
    for cl in 'INFU':
        t=T[(c,cl)]; row.append(f"{t['found']}/{t['n']} g{t['g_yes']} p{t['g_partial']}"); tf+=t['found'];tg+=t['g_yes'];tn+=t['n']
    row.append(f"{tf}/{tn} g{tg}")
    t=T[(c,'K')]; row.append(f"{t['clean']}/{t['n']}")
    print(f'{c:5} '+'  '.join(f'{x:>14}' for x in row))
