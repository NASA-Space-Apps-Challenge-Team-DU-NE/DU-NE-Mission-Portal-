"""Prepare bounded static NASA assets. No Python server is required by the website.

Original source files are read-only. A missing source is downloaded only with
--download-missing, to this project's data/raw directory, from this allowlist.
Existing files are never replaced based on age. Use --source-root for a new PC.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from PIL import Image

from nasa_data import PROJECT, LolaTerrain, SpiceFrames, config, label_value

PDS = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/"
NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
SVS = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"
URLS = {
    "ldem_75s_240m.img": PDS + "ldem_75s_240m.img",
    "ldem_75s_240m.lbl": PDS + "ldem_75s_240m.lbl",
    "de440s.bsp": NAIF + "spk/planets/de440s.bsp",
    "moon_pa_de440_200625.bpc": NAIF + "pck/moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf": NAIF + "fk/satellites/moon_de440_250416.tf",
    "naif0012.tls": NAIF + "lsk/naif0012.tls",
    "pck00011.tpc": NAIF + "pck/pck00011.tpc",
    "ldem_4_uint.tif": SVS + "ldem_4_uint.tif",
}
GLOBAL_HASH = "e6668bec27fc9b8fbb02d198c7ddfb08eedeeb790167b494f95e6b34201da05e"


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as f:
        for part in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(part)
    return digest.hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")


def hermite(a, da, b, db, u, dt):
    v = (2*u**3-3*u*u+1)*a + (u**3-2*u*u+u)*dt*da + (-2*u**3+3*u*u)*b + (u**3-u*u)*dt*db
    dv = (6*u*u-6*u)/dt*a + (3*u*u-4*u+1)*da + (-6*u*u+6*u)/dt*b + (3*u*u-2*u)*db
    return v, dv


def export_frames(out, cfg):
    frames = SpiceFrames()
    epoch = frames.utc_to_et(cfg["static_epoch_utc"])
    start, end = cfg["static_coverage_seconds"]
    step = cfg["static_frame_step_seconds"]
    offsets = np.arange(start, end + step / 2, step)
    states = [frames.sxform(epoch + t) for t in offsets]
    samples = [{"t_s": float(t), "rotation": x[:3, :3].ravel().tolist(), "derivative": x[3:, :3].ravel().tolist()}
               for t, x in zip(offsets, states)]
    max_r, max_d, max_pos, max_vel, max_orth = 0., 0., 0., 0., 0.
    # Three independent interior times per interval test the exported Hermite law.
    for i in range(len(states)-1):
        for u in (.25, .5, .75):
            exact = frames.sxform(epoch + offsets[i] + step*u)
            r, d = hermite(states[i][:3,:3], states[i][3:,:3], states[i+1][:3,:3], states[i+1][3:,:3], u, step)
            er = np.linalg.norm(r - exact[:3,:3], ord=2)
            ed = np.linalg.norm(d - exact[3:,:3], ord=2)
            max_r, max_d = max(max_r, er), max(max_d, ed)
            max_pos, max_vel = max(max_pos, er*1837400), max(max_vel, ed*1837400)
            max_orth = max(max_orth, float(np.linalg.norm(r.T@r-np.eye(3), ord=2)))
    roundtrip = []
    for lat, lon in [(-89.4441,-137.291),(-84.6,31),(0,0),(45,120)]:
        fixed = np.r_[1737400*np.array([np.cos(np.radians(lat))*np.cos(np.radians(lon)),np.cos(np.radians(lat))*np.sin(np.radians(lon)),np.sin(np.radians(lat))]),[.1,.2,.3]]
        back = frames.inertial_to_fixed(frames.fixed_to_inertial(fixed, epoch), epoch)
        roundtrip.append(float(np.max(np.abs(back-fixed))))
    validation = {"samples_tested": 3*(len(states)-1), "method": "cubic Hermite elementwise R and dR/dt from sxform; measured at 1/4,1/2,3/4 of every interval",
                  "max_rotation_matrix_error_2norm": max_r,"max_derivative_error_per_s": max_d,
                  "max_position_error_at_100km_m":max_pos,"max_surface_velocity_error_at_100km_m_s":max_vel,
                  "max_orthogonality_defect":max_orth,"max_spice_roundtrip_state_error":max(roundtrip),
                  "precision_scope":"Interpolation only; kernel/model/data uncertainties are separate. Interior samples are measured checks, not a rigorous error bound."}
    data = {**frames.info(),"epoch_utc":cfg["static_epoch_utc"],"epoch_et":epoch,"step_s":step,"coverage_s":[start,end],"samples":samples,
            "kernel_coverage_utc":frames.info()["coverage_utc"],"table_coverage_utc":[frames.et_to_utc(epoch+start),frames.et_to_utc(epoch+end)],
            "matrix_order":"row-major","matrix_convention":"rJ=R*rME; vJ=Rdot*rME+R*vME", "interpolation":"cubic Hermite; derivative is analytic derivative of interpolated R",
            "utc_et_note":"During this exported week UTC elapsed seconds equal ET elapsed seconds to <1ms; no leap second. Use epoch_et+t for TDB dynamics. SPICE UTC conversion was used for epoch.",
            "validation":validation}
    write_json(out/"frames.json",data)
    return validation,frames.info()


def export_terrain(out):
    terrain=LolaTerrain()
    tile_dir=out/"terrain/tiles"
    tile_dir.mkdir(parents=True,exist_ok=True)
    tile_size=256
    tiles=[]
    for r in range(0,terrain.rows,tile_size):
        for c in range(0,terrain.cols,tile_size):
            rr,cc=np.indices((min(tile_size,terrain.rows-r),min(tile_size,terrain.cols-c)))
            lat,_=terrain.pixel_to_latlon(rr+r,cc+c)
            # Only tiles intersecting the requested south 75-degree cap are emitted.
            if np.all(lat>terrain.maximum_latitude+.02):
                continue
            tile=np.full((tile_size,tile_size),-32768,dtype="<i2")
            chunk=terrain.dn[r:r+tile_size,c:c+tile_size]
            tile[:chunk.shape[0],:chunk.shape[1]]=chunk
            target=tile_dir/f"{r//tile_size}_{c//tile_size}.bin"
            tile.tofile(target)
            tiles.append({"row":r//tile_size,"col":c//tile_size,"bytes":target.stat().st_size,"sha256":sha(target)})
    meta={"schema":"lunar.terrain.tiles.v1","source":"NASA LOLA LDEM_75S_240M V2.0","source_url":PDS+"ldem_75s_240m.lbl",
          "source_sha256":sha(terrain.image_path),"rows":terrain.rows,"cols":terrain.cols,"tile_size":tile_size,"tile_path":"tiles/{row}_{col}.bin",
          "dtype":"int16le","scale_m":terrain.scale_m,"reference_radius_m":terrain.reference_radius_m,"pixel_m":terrain.pixel_m,
          "line_projection_offset":terrain.row0,"sample_projection_offset":terrain.col0,"center_lat_deg":-90,"center_lon_deg":terrain.lon0,
          "min_lat":terrain.minimum_latitude,"max_lat":terrain.maximum_latitude,"nodata":-32768,"height_offset_m":0,
          "coordinates":"MOON_ME / MEAN EARTH-POLAR AXIS DE421; FK MOON_ME_DE440_ME421 aligned realization",
          "projection":"rho=2R*tan((90+lat)/2); x=rho*sin(lon); y=rho*cos(lon); col=sample_offset+x/pixel; row=line_offset-y/pixel; angles in radians",
          "product_creation_time":label_value(terrain.label,"PRODUCT_CREATION_TIME"),"original_observation_stop":label_value(terrain.label,"STOP_TIME"),
          "sampling":"bilinear native grid; no vertical exaggeration; pad -32768 is unavailable","grid_spacing_not_measurement_resolution":True,
          "global_fallback":"global.json","tiles":tiles}
    write_json(out/"terrain/index.json",meta)
    # Small overview is visual context only. Never substitute it for collision sampling.
    step=8
    coarse=terrain.dn[::step,::step].astype("<i2")
    coarse.tofile(out/"terrain/context.bin")
    write_json(out/"terrain/context.json",{"rows":coarse.shape[0],"cols":coarse.shape[1],"original_pixel_stride":step,"dtype":"int16le","scale_m":.5,"purpose":"overview only; not collision tests"})
    random=np.random.default_rng(20261115)
    rr=random.integers(1,terrain.rows-2,1000)
    cc=random.integers(1,terrain.cols-2,1000)
    lat,lon=terrain.pixel_to_latlon(rr,cc)
    rows2,cols2=terrain.latlon_to_pixel(lat,lon)
    pixel_error=float(max(np.max(np.abs(rr-rows2)),np.max(np.abs(cc-cols2))))
    valid=lat<=-75
    values=terrain.elevations(lat[valid],lon[valid])
    height_error=float(np.max(np.abs(values-terrain.dn[rr[valid],cc[valid]]*.5)))
    return meta,{"pixel_roundtrip_max_error_px":pixel_error,"pixel_center_elevation_max_error_m":height_error,
                 "south_pole_pixel":[terrain.row0,terrain.col0],"out_of_domain_returns_none":terrain.elevation(0,0) is None,
                 "native_size_bytes":terrain.image_path.stat().st_size,"tile_count":len(tiles),"total_tiled_bytes":sum(t["bytes"] for t in tiles)}


def export_global(out,path):
    if sha(path)!=GLOBAL_HASH:
        raise ValueError("Global TIFF differs from existing verified Drive README SHA-256")
    img=np.asarray(Image.open(path))
    if img.shape!=(720,1440) or img.dtype!=np.uint16:
        raise ValueError("Unexpected NASA SVS global grid")
    # One-degree cells contain maxima of every native4ppd input cell, not an
    # average or interpolation. This is conservative for this finite DEM model,
    # and is NOT a bound on subpixel peaks in the real lunar terrain.
    pooled=img.reshape(180,4,360,4).max(axis=(1,3))
    pooled.astype("<u2").tofile(out/"terrain/global.bin")
    meta={"schema":"lunar.global-dem.v1","source":"NASA SVS4720 / LOLA 4 pixels per degree (2019)","source_url":URLS["ldem_4_uint.tif"],
          "source_sha256":GLOBAL_HASH,"drive_id":"1UoLm92sn5Ul3HbHx03VhCeNuaQmZhbBq","rows":180,"cols":360,"pixels_per_degree":1,
          "dtype":"uint16le","scale_m":.5,"height_offset_m":-10000,"offset_m":-10000,"reference_radius_m":1737400,"path":"global.bin","data_path":"global.bin",
          "longitude_origin_deg":-180,"model":"max-pooled","native_pixels_per_degree":4,
          "projection":"equirectangular; lon -180 to +180 left-to-right; lat +90 to -90 top-to-bottom; nearest containing one-degree cell",
          "row_formula":"floor((90-lat)); clamp poles","col_formula":"floor(wrap(lon+180,360)); periodic longitude; NO BILINEAR",
          "minimum_m":float(img.min()*.5-10000),"maximum_m":float(img.max()*.5-10000),"nominal_equatorial_pixel_m":np.pi*1737400/720,
          "use":"High-altitude coarse model screening only. Requires native 240m south-polar tiles for landing. Unresolved terrain is not a landing-safety certification.",
          "minimum_allowed_altitude_for_global_model_m":12000,"sha256":sha(out/"terrain/global.bin"),"bytes":int(pooled.nbytes)}
    write_json(out/"terrain/global.json",meta)
    return meta


def source_inventory(cfg,global_path,frame_info):
    snapshot=json.loads((PROJECT/"docs/drive_snapshot/metadata.json").read_text(encoding="utf-8"))
    remote={f["title"]:f for f in snapshot["files"]}
    srcroot=Path(cfg["source_root"])
    files=[Path(cfg["dem"]["image"]),Path(cfg["dem"]["label"])]
    files += [Path(cfg["kernel_dir"])/n for n in ("de440s.bsp","moon_pa_de440_200625.bpc","moon_de440_250416.tf","naif0012.tls","pck00011.tpc")]
    files += [PROJECT/"data/catalogs"/n for n in ("sites.json","landers.json","data_manifest.json","terrain_sources.json")]
    texture_source=Path(cfg["reference_texture"])
    if not texture_source.exists():
        texture_source=PROJECT/"frontend/public/data/moon-gray-2k.jpg"
    files += [global_path,texture_source]
    entries=[]
    for path in files:
        name=path.name
        meta=remote.get(name,{})
        cat=path.parent.name=="catalogs"
        original=srcroot/"Catalogs"/name if cat else path
        old_hash=sha(original) if cat and original.exists() else None
        hash_=sha(path)
        status="NEW_DOWNLOAD" if str(path.resolve()) in cfg.get("new_download_paths",[]) else "REUSED"
        if cat:
            status="REFRESHED_PROJECT_COPY" if old_hash!=hash_ else "REUSED_CONTENT_PROJECT_SNAPSHOT"
        stage="static MOON_ME/J2000 state transform export" if name.endswith((".bpc",".bsp",".tf",".tpc",".tls")) else "native terrain height, tile export, collision model"
        if cat:stage="catalog input/provenance review"
        if name.endswith(".jpg"):stage="visual-only Moon texture; not a physical height input"
        if name=="ldem_4_uint.tif":stage="coarse high-altitude global collision model"
        entry={"file":name,"source_path":str(original),"used_path":str(path),"bytes":path.stat().st_size,"sha256":hash_,"status":status,"calculation":stage,
               "source_url":URLS.get(name,"https://svs.gsfc.nasa.gov/4720/" if name.endswith(".jpg") else meta.get("url")),
               "drive_file_id":meta.get("id"),"drive_size":int(meta["size"]) if meta.get("size") else None,
               "drive_modified_utc":meta.get("modified_time"),"drive_size_matches":path.stat().st_size==int(meta["size"]) if meta.get("size") else None,
               "drive_sha256_comparison":"connector omitted checksum fields; remote equality not claimed","version":name,"source_generation_time":None}
        if name.startswith("ldem_75"):
            entry.update(version="V2.0",source_generation_time="2017-06-15",product_id="LRO-L-LOLA-4-GDR-V1.0 / LDEM_75S_240M")
        if name=="ldem_4_uint.tif":
            entry.update(drive_file_id="1UoLm92sn5Ul3HbHx03VhCeNuaQmZhbBq",drive_size=2076866,drive_sha256_comparison="MATCHES SHA-256 recorded in current Drive README (not an independent remote full-byte read)",version="NASA SVS4720 2019 4ppd",source_generation_time="2019-06-04T16:14:59")
        if cat:entry["prior_local_sha256"]=old_hash
        entries.append(entry)
    # Explicitly inspect requested-but-not-needed files and preserve them in place.
    for name in ("ldem_80s_80m.img","ldem_80s_80m.lbl"):
        p=srcroot/"Raw_Data/LOLA_DEM"/name
        if p.exists():
            entries.append({"file":name,"source_path":str(p),"bytes":p.stat().st_size,"sha256":sha(p),"status":"SKIPPED","reason":"Native240m model is sufficient for first trajectory demonstration; no 80m request or browser payload.","source_url":PDS+name,"drive_file_id":remote.get(name,{}).get("id"),"version":"V2.0"})
    truncated=srcroot/"Raw_Data/LOLA_DEM_Global/ldem_128.img"
    if truncated.exists():
        entries.append({"file":truncated.name,"source_path":str(truncated),"bytes":truncated.stat().st_size,"sha256":sha(truncated),"status":"SKIPPED_INVALID","reason":"Truncated: label expects 23040*46080*2=2123366400 bytes. Preserved untouched. Existing valid4ppd substitutes only coarse high-altitude model.","version":"LDEM_128"})
    return {"audit_date_kst":"2026-11-15","downloads_path":str(srcroot.parent),"drive_folder_id":"1u3A21Su1smMEnUlx3kpJC99qzWuxtrX2",
            "files":entries,"kernel_coverage":frame_info,"downloads_policy":"No timestamp-only updates; no Drive or existing project writes; no science raw download required this run.",
            "excluded_groups":["Diviner temperature","magnetism","mineral spectra","neutron/hydrogen/FeO","CRaTER radiation","LROC global originals","full PGDA98","full5m/10m DEM","Artemis navigation grids"],
            "exclusion_reason":"Not an input to the100km lunar descent equations; native240m model and small existing global4ppd model suffice."}


def reference_cases(cfg):
    frames=SpiceFrames()
    terrain=LolaTerrain()
    epoch=frames.utc_to_et(cfg["static_epoch_utc"])
    spice_cases=[]
    for i,t in enumerate((-7050,150,13050,86325,302550,604650)):
        fixed=np.array([1300000.,-650000.,950000.,10.+i,-20.+i,5.-i])
        spice_cases.append({"utc":frames.et_to_utc(epoch+t),"t_s":t,"fixed_state":fixed.tolist(),
                            "inertial_state":frames.fixed_to_inertial(fixed,epoch+t).tolist(),
                            "source":"spiceypy sxform MOON_ME to J2000 with loaded DE440 kernels"})
    terrain_cases=[]
    coords=[(-89.4441,-137.291),(-90,0),(-90,145),(-80,0),(-80,90),(-80,-90),(-80,180),(0,0),(-74,10)]
    for row,col in ((1792.,1792.),(1791.99,1792.01),(256.01,1791.99),(2047.99,2048.01),(1905.5,1905.5)):
        lat,lon=terrain.pixel_to_latlon(row,col)
        coords.append((float(lat),float(lon)))
    for lat,lon in coords:
        terrain_cases.append({"latitude_deg":lat,"longitude_deg":lon,"elevation_m":terrain.elevation(lat,lon),
                              "source":"Python native PDS240m bilinear sample; projection tested against label and DSMAP_POLAR.CAT"})
    value={"spice":spice_cases,"terrain":terrain_cases,"units":"metres, metres/second; planetocentric degrees east-positive",
           "interpolation_tolerances":{"position_m":0.001,"velocity_m_s":1e-5},
           "kernel_files":frames.kernels}
    write_json(PROJECT/"docs/spice-reference-cases.json",value)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root",type=Path)
    parser.add_argument("--global-source",type=Path)
    parser.add_argument("--download-missing",action="store_true")
    args=parser.parse_args()
    cfg=config()
    cfg["new_download_paths"]=[]
    if args.source_root:
        cfg["source_root"]=str(args.source_root.resolve())
        cfg["dem"]={"image":str(args.source_root/"Raw_Data/LOLA_DEM/ldem_75s_240m.img"),"label":str(args.source_root/"Raw_Data/LOLA_DEM/ldem_75s_240m.lbl")}
        cfg["kernel_dir"]=str(args.source_root/"Raw_Data/SPICE_Kernels")
    global_path=args.global_source or Path(cfg.get("global_dem",str(PROJECT.parent/"outputs/global_data_2026-11-14/data/LOLA_DEM_Global/ldem_4_uint.tif")))
    required=[Path(cfg["dem"]["image"]),Path(cfg["dem"]["label"]),global_path]+[Path(cfg["kernel_dir"])/n for n in ("de440s.bsp","moon_pa_de440_200625.bpc","moon_de440_250416.tf","naif0012.tls","pck00011.tpc")]
    for path in required:
        if path.exists():continue
        if not args.download_missing:
            raise FileNotFoundError(f"Missing {path}. Supply --source-root/--global-source or explicitly --download-missing.")
        # Download only to new project; the source tree is never modified.
        dest=PROJECT/"data/raw"/path.name
        dest.parent.mkdir(parents=True,exist_ok=True)
        if not dest.exists():
            # A failed transfer leaves only a project-local .partial, never an
            # apparently valid final file. The original source is untouched.
            partial=dest.with_suffix(dest.suffix+".partial")
            urllib.request.urlretrieve(URLS[path.name],partial)
            partial.replace(dest)
            cfg["new_download_paths"].append(str(dest.resolve()))
        if path.name.startswith("ldem_75s"):
            cfg["dem"]["image" if path.suffix==".img" else "label"]=str(dest)
        elif path.name=="ldem_4_uint.tif":global_path=dest
        else:
            # Copy already-valid small kernels if an alternate root is partially missing.
            for kernel in required[3:]:
                if kernel.exists() and not (dest.parent/kernel.name).exists():shutil.copyfile(kernel,dest.parent/kernel.name)
            cfg["kernel_dir"]=str(dest.parent)
    cfg["global_dem"]=str(global_path.resolve())
    write_json(PROJECT/"data/config.json",cfg)
    out=PROJECT/"frontend/public/data"
    out.mkdir(parents=True,exist_ok=True)
    for name in ("sites.json","landers.json"):
        shutil.copyfile(PROJECT/"data/catalogs"/name,out/name)
    texture=Path(cfg["reference_texture"])
    if texture.exists():shutil.copyfile(texture,out/"moon-gray-2k.jpg")
    elif not (out/"moon-gray-2k.jpg").exists():raise FileNotFoundError("Small Moon texture missing; use shipped public/data asset or source reference texture")
    terrain,terrain_tests=export_terrain(out)
    global_meta=export_global(out,global_path)
    frame_tests,frame_info=export_frames(out,cfg)
    inventory=source_inventory(cfg,global_path,frame_info)
    write_json(PROJECT/"docs/data_inventory.json",inventory)
    checks={"terrain":terrain_tests,"spice":frame_tests,"global_sha256_matches_drive_readme":sha(global_path)==GLOBAL_HASH}
    reference_cases(cfg)
    write_json(PROJECT/"docs/data_validation.json",checks)
    write_json(out/"manifest.json",{"schema":"lunar.static-data.v1","generated_date_kst":"2026-11-15","source_audit":"DATA_AUDIT.md","reference_radius_m":1737400,
         "orientation_table_coverage_utc":[(datetime.fromisoformat(cfg["static_epoch_utc"].replace("Z","+00:00"))+timedelta(seconds=t)).isoformat().replace("+00:00","Z") for t in cfg["static_coverage_seconds"]],
         "landing_time_coverage_utc":[cfg["static_epoch_utc"],(datetime.fromisoformat(cfg["static_epoch_utc"].replace("Z","+00:00"))+timedelta(seconds=cfg["static_coverage_seconds"][1])).isoformat().replace("+00:00","Z")],
         "frame_file":"frames.json","terrain_index":"terrain/index.json","global_terrain_index":"terrain/global.json","sites":"sites.json","landers":"landers.json",
         "texture":{"url":"moon-gray-2k.jpg","source_url":"https://svs.gsfc.nasa.gov/4720/","credit":"NASA Scientific Visualization Studio / Ernie Wright, LROC and LOLA teams; team grayscale derivative","quantitative":False},
         "data_validation":checks,"files":[{k:f.get(k) for k in ("file","bytes","sha256","source_url","drive_file_id","status","version")} for f in inventory["files"] if f["status"] not in ("SKIPPED","SKIPPED_INVALID")],
         "limitations":["240m is nominal grid spacing, not complete240m terrain measurement; no footprint hazards or slope safety.","Global4ppd screening is coarse and may miss peaks; low-altitude landings require southern240m DEM.","MOON_ME_DE440_ME421 closely aligns with ME421; finite realization difference is not a navigation certification.","NASA data does not mean NASA-validated simulation."]})
    print(json.dumps({"terrain":terrain_tests,"spice":frame_tests,"global":{k:global_meta[k] for k in ("minimum_m","maximum_m","nominal_equatorial_pixel_m")}},indent=2))


if __name__=="__main__":main()
