"""Test-only independent interval oracle; certify exact rational endpoint cells."""
import math
import struct
from decimal import Context, Decimal, ROUND_CEILING, ROUND_FLOOR
from fractions import Fraction

PI = (0, (Fraction(0), Fraction(0)))

def atan_series(r, p):
    if r < 0:
        lo, hi = atan_series(-r, p)
        return -hi, -lo
    total, power, odd, sign = Fraction(0), r, 1, 1
    tolerance = Fraction(1, 1 << p)
    while True:
        total += sign * power / odd
        power *= r*r
        odd += 2
        sign = -sign
        tail = power / odd
        if tail <= tolerance:
            return (total,total+tail) if sign > 0 else (total-tail,total)

def pi_bounds(p):
    global PI
    if PI[0] >= p:
        return PI[1]
    precision = ((p+255)//256)*256
    a,b=atan_series(Fraction(1,2),precision),atan_series(Fraction(1,3),precision)
    PI=precision,(4*(a[0]+b[0]),4*(a[1]+b[1]))
    return PI[1]

def atan_bounds(r,p):
    if r < 0:
        lo,hi=atan_bounds(-r,p)
        return -hi,-lo
    if r > 1:
        a,b=atan_bounds(1/r,p),pi_bounds(p)
        return b[0]/2-a[1],b[1]/2-a[0]
    if r > Fraction(1,2):
        a,b=atan_series((r-1)/(r+1),p),pi_bounds(p)
        return b[0]/4+a[0],b[1]/4+a[1]
    return atan_series(r,p)

def sqrt_bounds(r,p):
    scale=1 << p
    value=r.numerator*scale*scale
    root=math.isqrt(value//r.denominator)
    return Fraction(root,scale),Fraction(root+(root*root*r.denominator!=value),scale)

def inverse_bounds(kind,x,y,p):
    if kind=='atan':
        return atan_bounds(Fraction(x),p)
    if kind=='atan2':
        if x==0:
            lo,hi=pi_bounds(p)
            return (lo/2,hi/2) if y>0 else (-hi/2,-lo/2)
        lo,hi=atan_bounds(abs(Fraction(y)/Fraction(x)),p)
        if x<0:
            pl,ph=pi_bounds(p)
            lo,hi=pl-hi,ph-lo
        return (-hi,-lo) if y<0 else (lo,hi)
    r=Fraction(abs(x))
    if kind=='asin':
        sl,sh=sqrt_bounds(1-r*r,p)
        lo=2*atan_bounds(r/(1+sh),p)[0]
        hi=2*atan_bounds(r/(1+sl),p)[1]
        return (-hi,-lo) if x<0 else (lo,hi)
    sl,sh=sqrt_bounds((1-r)/(1+r),p)
    lo,hi=2*atan_bounds(sl,p)[0],2*atan_bounds(sh,p)[1]
    if x<0:
        pl,ph=pi_bounds(p)
        lo,hi=pl-hi,ph-lo
    return lo,hi

def forward_bounds(kind,x,p):
    negative=x<0
    r=Fraction(abs(x))
    if r < Fraction(1,1 << 30):
        if kind=='sin':
            lo,hi=r-r*r*r/6,r
        elif kind=='cos':
            lo=1-r*r/2
            hi=lo+r**4/24
        else:
            lo,hi=r,r/(1-r*r/2)
        return (-hi,-lo) if negative and kind!='cos' else (lo,hi)
    rp=p+max(0,r.numerator.bit_length()-r.denominator.bit_length())+64
    pl,ph=pi_bounds(rp)
    ql=(2*r/ph+Fraction(1,2)).__floor__()
    qh=(2*r/pl+Fraction(1,2)).__floor__()
    if ql!=qh:
        return None
    rl,rh=r-ql*ph/2,r-ql*pl/2
    assert max(abs(rl),abs(rh))<1
    low=Context(prec=p//3+10,rounding=ROUND_FLOOR)
    high=Context(prec=p//3+10,rounding=ROUND_CEILING)
    def dec(value):
        n,d=Decimal(value.numerator),Decimal(value.denominator)
        return low.divide(n,d),high.divide(n,d)
    def plus(a,b):
        return low.add(a[0],b[0]),high.add(a[1],b[1])
    def minus(a):
        return a[1].copy_negate(),a[0].copy_negate()
    def times(a,b):
        return min(low.multiply(u,v) for u in a for v in b),max(high.multiply(u,v) for u in a for v in b)
    angle=dec(rl)[0],dec(rh)[1]
    squared=times(angle,angle)
    def polynomial(cosine):
        m=0
        while math.factorial(2*m+(2 if cosine else 3)) < 1 << p:
            m+=1
        total=dec(Fraction((-1)**m,math.factorial(2*m+(0 if cosine else 1))))
        for k in range(m-1,-1,-1):
            coefficient=dec(Fraction((-1)**k,math.factorial(2*k+(0 if cosine else 1))))
            total=plus(times(total,squared),coefficient)
        if not cosine:
            total=times(total,angle)
        error=dec(Fraction(1,math.factorial(2*m+(2 if cosine else 3))))[1]
        return plus(total,(error.copy_negate(),error))
    sine,cosine=polynomial(False),polynomial(True)
    quadrant=ql%4
    if quadrant==1:
        sine,cosine=cosine,minus(sine)
    elif quadrant==2:
        sine,cosine=minus(sine),minus(cosine)
    elif quadrant==3:
        sine,cosine=minus(cosine),sine
    if negative:
        sine=minus(sine)
    if kind=='sin':
        answer=sine
    elif kind=='cos':
        answer=cosine
    else:
        if cosine[0]<=0<=cosine[1]:
            return None
        answer=min(low.divide(u,v) for u in sine for v in cosine),max(high.divide(u,v) for u in sine for v in cosine)
    return tuple(Fraction(value) for value in answer)

def decode(value):
    return None if value is None else struct.unpack('>d',bytes.fromhex(value))[0]

def bits(value):
    return None if value is None else struct.pack('>d',0.0 if value == 0 else value).hex()

def _round_endpoint(value):
    try:
        return bits(float(value))
    except OverflowError:
        return None

def rounding_cell(code):
    """Exact nearest-even cell, including merged signed-zero normalization."""
    value=decode(code)
    if value == 0:
        half=Fraction(1,1 << 1075)
        return -half,half,True
    before=math.nextafter(value,-math.inf)
    after=math.nextafter(value,math.inf)
    center=Fraction(value)
    low=(Fraction(before)+center)/2 if math.isfinite(before) else center-Fraction(1 << 970)
    high=(center+Fraction(after))/2 if math.isfinite(after) else center+Fraction(1 << 970)
    return low,high,int(code,16)%2 == 0

def certify_cell(left,right,code):
    assert left <= right
    if code is None:
        threshold=Fraction(float.fromhex('0x1.fffffffffffffp+1023'))+Fraction(1 << 970)
        return left >= threshold or right <= -threshold
    low,high,inclusive=rounding_cell(code)
    return (left>low or inclusive and left==low) and (right<high or inclusive and right==high)

def _answer(case,start=192):
    kind,x,y=case['kind'],decode(case['x']),decode(case.get('y'))
    if x is None or not math.isfinite(x):
        return None,0
    if kind=='atan2' and (y is None or not math.isfinite(y)):
        return None,0
    if kind in ['asin','acos'] and abs(x)>1:
        return None,0
    if kind=='atan2' and x==0 and y==0:
        return bits(0),0
    p=start
    while True:
        if kind in ['sin','cos','tan']:
            interval=forward_bounds(kind,x,p)
        else:
            interval=inverse_bounds(kind,x,y,p)
        if interval is None:
            p+=160
            continue
        left,right=interval
        lo,hi=_round_endpoint(left),_round_endpoint(right)
        if lo==hi:
            assert certify_cell(left,right,lo), (case,p,lo)
            return lo,p
        p+=160


def expected(kind, first, second=None, start=192):
    """Independent correctly rounded answer; atan2 keeps public (y,x) order."""
    x,y=(second,first) if kind=='atan2' else (first,None)
    answer,_=_answer({'kind':kind,'x':bits(x),'y':bits(y)},start)
    return decode(answer)


def certified(kind, first, second, actual, start=192):
    wanted=expected(kind,first,second,start)
    if actual is None or wanted is None:
        return actual is wanted
    return struct.pack('>d',actual)==struct.pack('>d',wanted)
