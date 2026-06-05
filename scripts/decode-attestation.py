import base64, json, sys

data = json.load(open(sys.argv[1]))
buf = base64.b64decode(data["attestation_document"])

BREAK = object()

class D:
    def __init__(self, b): self.b=b; self.i=0
    def u(self, n):
        v=int.from_bytes(self.b[self.i:self.i+n],'big'); self.i+=n; return v
    def item(self):
        ib=self.b[self.i]; self.i+=1
        mt=ib>>5; ai=ib&0x1f
        if ai==31:
            if mt==7: return BREAK
            indef=True; val=None
        else:
            indef=False
            if ai<24: val=ai
            elif ai==24: val=self.u(1)
            elif ai==25: val=self.u(2)
            elif ai==26: val=self.u(4)
            elif ai==27: val=self.u(8)
            else: raise ValueError("ai %d"%ai)
        if mt==0: return val
        if mt==1: return -1-val
        if mt==2:
            if indef:
                out=b""
                while True:
                    c=self.item()
                    if c is BREAK: break
                    out+=c
                return out
            s=self.b[self.i:self.i+val]; self.i+=val; return s
        if mt==3:
            if indef:
                out=b""
                while True:
                    c=self.item()
                    if c is BREAK: break
                    out+=c if isinstance(c,bytes) else c.encode()
                return out.decode('utf-8','replace')
            s=self.b[self.i:self.i+val]; self.i+=val; return s.decode('utf-8','replace')
        if mt==4:
            out=[]
            if indef:
                while True:
                    c=self.item()
                    if c is BREAK: break
                    out.append(c)
            else:
                for _ in range(val): out.append(self.item())
            return out
        if mt==5:
            d={}
            if indef:
                while True:
                    k=self.item()
                    if k is BREAK: break
                    d[k]=self.item()
            else:
                for _ in range(val):
                    k=self.item(); d[k]=self.item()
            return d
        if mt==6:
            return self.item()
        if mt==7:
            return {20:False,21:True,22:None}.get(val,val)
        raise ValueError("mt %d"%mt)

cose=D(buf).item()
pd=D(cose[2]).item()
pcrs=pd.get("pcrs",{})
print("module_id:", pd.get("module_id"))
print("timestamp:", pd.get("timestamp"))
nonzero=[]
for idx in sorted(k for k in pcrs.keys() if isinstance(k,int)):
    h=pcrs[idx].hex()
    allzero = set(h)=={"0"}
    if idx<=2:
        print(f"PCR{idx}: {h}  (len {len(pcrs[idx])}B/{len(h)}hex){'  [ALL ZERO - debug build]' if allzero else ''}")
pk=pd.get("public_key")
print("public_key(doc) hex:", pk.hex() if pk else None, "len", len(pk) if pk else 0)
print("public_key(json) hex:", base64.b64decode(data['public_key']).hex())
# emit a pcr-values.json-shaped object for the aegis register script
print("PCR_JSON:", json.dumps({"pcr0":pcrs.get(0,b'').hex(),"pcr1":pcrs.get(1,b'').hex(),"pcr2":pcrs.get(2,b'').hex()}))
