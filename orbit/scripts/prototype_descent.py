"""Development-only numerical study; runtime engine lives in TypeScript."""
import numpy as np
from scipy.optimize import least_squares

MU=4.90280011845755e12
R=1737400.

def grav(r):
    return -MU*r/np.linalg.norm(r)**3

def propagate(y, controls, dt, subdiv=10):
    y=y.copy(); points=[y.copy()]
    h=dt/subdiv
    for a in controls:
        def f(z): return np.r_[z[3:],grav(z[:3])+a]
        for _ in range(subdiv):
            k1=f(y);k2=f(y+h*k1/2);k3=f(y+h*k2/2);k4=f(y+h*k3)
            y+=h*(k1+2*k2+2*k3+k4)/6
        points.append(y.copy())
    return np.array(points)

def solve(T=400,beta=None,N=24):
    rp=R+15000;ra=R+100000;vp=np.sqrt(MU*(2/rp-2/(rp+ra)))
    beta=beta or vp*T/(2*rp)
    y0=np.array([rp*np.cos(beta),-rp*np.sin(beta),0,vp*np.sin(beta),vp*np.cos(beta),0])
    yf=np.array([R+1954,0,0,0,4.6,0])
    # Hermite seed (only seeds controls, never returned as a flight path)
    p0=y0[:3];v0=y0[3:];pf=yf[:3];vf=yf[3:]
    c2=(3*(pf-p0)-(2*v0+vf)*T)/T**2
    c3=(2*(p0-pf)+(v0+vf)*T)/T**3
    ts=(np.arange(N)+.5)*T/N
    controls=[]
    for t in ts:
        r=p0+v0*t+c2*t*t+c3*t**3
        controls.append(2*c2+6*c3*t-grav(r))
    controls=np.array(controls)
    # Six global correction moments solve position/velocity endpoint.
    def adjusted(q): return controls+q[:3]+(ts/T-.5)[:,None]*q[3:]
    def residual(q):
        last=propagate(y0,adjusted(q),T/N,5)[-1]
        return (last-yf)/np.array([1000]*3+[10]*3)
    opt=least_squares(residual,np.zeros(6),xtol=1e-12,ftol=1e-12,gtol=1e-12)
    a=adjusted(opt.x)
    pts=propagate(y0,a,T/N,30)
    mass=1500*np.exp(-np.r_[0,np.cumsum(np.linalg.norm(a,axis=1)*T/N)]/(320*9.80665))
    thrust=mass[:-1]*np.linalg.norm(a,axis=1)
    print(T,beta,'err',pts[-1]-yf,'h min',np.min(np.linalg.norm(pts[:,:3],axis=1)-R-1954),'fuel',1500-mass[-1],'thrust max',max(thrust),'dv',sum(np.linalg.norm(a,axis=1))*T/N)
    return pts,a,mass

if __name__=='__main__':
    for T in [300,350,400,450,500,550,600]: solve(T)
