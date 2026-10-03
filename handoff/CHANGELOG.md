# Changelog: Space Sim parts for the game

Each release is a git tag `parts-vX.Y.Z` and a GitHub release on `darrelmagasuc/space-sim-parts-viewer`. `handoff/parts_manifest.json` carries the same `manifest_version`. Releases are published **only when Darrel asks**; there is no schedule. The newest release is listed first.

How versions are bumped (`handoff/tools/publish_update.py`):
- **Minor:** parts or interiors were added or removed. Removals are listed as breaking.
- **Patch:** existing ids changed: files (GLB or nodes.json, by sha256) or manifest data only.

Each entry lists the ids that were added, changed or removed. Re-sync those ids by hash (see "Updates" in `AGENT_HANDOFF.md`).

## [0.5.0] - 2026-10-03

405 parts / 935 variants, 76 interiors (82 variants), 2 assemblies. Tag `parts-v0.5.0`. Published on Darrel's request (backup of the current state).

### AX interiors (new: 50)
The first AX interiors from Sergei's / Anastasia's interior team (`parts/interiors_modern/ax`), imported with the new `handoff/tools/import_ax_interiors.py`. `glb_interior` is the **baked** interior GLB (props embedded, same origin as the exterior). Each one was built against this release's exterior GLB (sha256 checked).
- **Finished (42):** AX-cmd-01, -02, -03, -04, -06, -07, -08; AX-aero-01 (round 4, 13:11); AX-rover-01, -03, -05, -06, -07, -08, -10, -11, -12; AX-aero-02, -04, -10; AX-grav-01, -02, -03; AX-util-01, -03, -04, -05; AX-station-01 to -08 and -10 to -17 (except -05, see below).
- **Included, round-4 updates pending (8):** AX-cmd-05 (jump-seat fold), AX-grav-05 to -09 (spin gravity), AX-aero-05 (aft-bulkhead handrails), AX-station-05 (hand-controller stow / workstation over the hip). Each carries `known_issue` with the pending item.
- **Not included (`interiors_skipped`):** AX-rover-02, AX-rover-04 (in progress: mid-rebuild, mixed LODs); AX-aero-06 (still building); AX-aero-03, -14 (not built yet). Base-line `rover12_interior` stays skipped, as before.
- **Props library:** Anastasia's 14 eqm props (`models/interiors/props/`, GLB + nodes.json + `props.index.json`; listed in `interiors.json` `props_library`) for runtime instancing. The baked interior GLBs already embed them.
- The interior team's own check results are in `validation.open_findings` (not gated). These include aisle findings on AX-cmd-03 / -07 seat-to-hatch paths, AX-cmd-06 (0.402 m to the docking hatch, seat-fold parts in the keep-out), AX-cmd-05 (0.478 m side-hatch path), and AX-station-16 storm-shelter / ECLSS rings 0.55 / 0.564 m (accepted as secondary paths). There are small hatch keep-out overlaps on AX-cmd-01 / -02 / -04 / AX-grav-03, and liner / bezel items 5 mm or more past the IML on several stations.

### AX exteriors (changed: 57)
The current AX exteriors and nodes.json from the B1 / B5 / B6 / B8 / B9 work of 2026-10-03 (hip 0.90 interior standard, station-16 core racks / entry tunnel / ladder keep-out, station-17 racks, suitport bores, mass estimates, spin-gravity blocks, rover-04 bunks / racks, rover-02 windows, aero-01 canopy hinge, aero-03 dorsal hatch, aero-05 handrails, cmd-02 / -04 / -05 consoles and seats). Both zips were refreshed (117 replaced + 2 added per zip).

### Unfinished (not in this release, next round)
- AX-cmd-02 / -04 interior round-4 updates (displays 0.32 x 0.12 x 0.18 on cmd-02, 0.12 m deep front console on cmd-04).
- Load re-checks for AX-station-08 / -15 / -16 (racks with the new attach / deck ratings).
- 6 mm tunnel-liner trims on AX-station-01 / -03 / -04 / -06 / -07 (liners 5 mm past the IML).
- AX-station-05 workstation: shoulder over the hip, controller deployed / stowed poses, panel trim for the window view prisms.
- Load ratings: rack attach points (5 kN ultimate, +30 %), handrails 890 / 1,330 N, rack hard-point deck zones 1,200 kg/m2.
- AX-station-15 rack_4 (ECLSS): 6 attach points.
- AX-station-16: the R5 source edits (tile-top datum, measured walkways, ladder stops below the hatch keep-out; source commit ba4265d) are **not rebuilt yet**. The released station-16 still has the earlier ladder allowance band and quotes the slab datum.

## [0.4.0] - 2026-10-02

405 parts / 934 variants, 26 interiors (32 variants), 2 assemblies. Tag `parts-v0.4.0`.

**The AX line** ("Ares-line" near-future hardware, faceted / chamfered AX style): 217 parts / 425 variants in batches B1-B10, next to the 188 base-line parts (unchanged). Both LODs (low-poly, CAD; the AX low-poly budget is 5,000 tris, up to 8,000 for crewed / complex parts: 76 variants are above 5,000, max 7,993), nodes.json, thumbnails, and both zips extended. See `AGENT_HANDOFF.md` §14.

**Manifest schema v3** (`schema_version` 3, additive; base-line entries are byte-for-byte unchanged, so their hashes did not move): AX parts and variants carry `line: "AX"` (no field = base line), `display_id` (`AX-cmd-01`), `key` (`ax_cmd_01` = `id`), `ax_category`, `batch`, `code`, `interior`, `aliases`, `redirects`; top-level `lines` (counts) and `redirects` (old id -> new id). AX slot items carry `slots.occupies`, AX slot hosts `slots.positions` (from nodes.json `variants[].extra.slots`).

**modern_set aliases:** `cmd11 -> ax_cmd_01`, `prop27 / prop28 / prop29 -> ax_prop_01 / 02 / 03`, `tank14 / tank15 -> ax_tank_01 / 02` (part ids and all 11 vids in `redirects`). modern_set was never released, so no craft breaks.

### AX batches
- **B1 Command modules & capsules** (AX-cmd-01..16, 16 parts / 22 variants): Ares 4-seat, Kestrel 2-seat, Ares Heavy 6-seat capsules, MAV ascent cabin, lunar lander cabin, tug cab, command deck, Ares cargo capsule, probe core / bus, avionics ring, service trunk, service module, launch escape tower, ablative heat shields S-XL, HIAD. Crew fit for the interior team's 1.8 m envelope: AX-cmd-02 / -03 docking-hatch faces now end exactly at the IML tunnel, seats re-tuned on 02 / 04 / 07 (>= 0.10 m; AX-cmd-07 side-hatch egress >= 0.6 m).
- **B2 Engines** (AX-prop-01..20, 20 / 34): Raptor-class vacuum and sea-level methalox, hopper landing cluster, aerospikes (bell and linear), booster cluster plate, small methalox, OMS, deep-throttle descent, hydrolox vacuum / booster, segmented SRB, kick motor, NTR, Hall and gridded-ion thrusters, abort pod, vernier, multi-engine thrust structure.
- **B3 Tanks** (AX-tank-01..16, 16 / 42): modern methalox S/M/L short/long, lander tank sections (L and M / XL), heavy barrels, header, hydrolox, hypergol, xenon COPV, toroidal, radial drop tank, depot core, water / shielding, ISRU O2, green monoprop, helium COPV, cryo transfer module.
- **B4 Structure & landing gear** (AX-struct-01..16, AX-gear-01..12, 28 / 78): faceted adapters S-M .. XL-XXL and skip adapters, stack / hot-staging / radial decouplers, payload fairing, capsule trunk adapter, boat-tail skirts, nose cones, entry aeroshell, payload adapter; lander / booster legs, skid strut, retractable nose / main / bogie gear, struts, trusses, junction cube, I-beam, deployable boom, service bay, multi-mount plate.
- **B5 Stations & surface habitats** (AX-station-01..18, 18 / 23): core and compact habs, 6-port node, dual airlock, cupola, lab, logistics, inflatable hab, service module, greenhouse, workshop, command, crew quarters, storm shelter, surface hab, inflatable surface dome, surface airlock / suitport, station truss.
- **B6 Gravity ring + docking** (AX-grav-01..12, AX-util-01..06, 18 / 18): **28 m floor radius at 4 rpm (0.50 g), 15 deg segments, 24 per ring**: despun hub, counter-rotating bearing, pressurised and truss spokes, habitat / lab / greenhouse / storage / bulkhead-airlock / counterweight / spin-drive segments, hub mast; IDSS, compact, CBM, heavy cargo ports, docking adapter, grapple fixture.
- **B7 Power, thermal & comms** (AX-power-01..18, 18 / 51): roll-out, rigid, fan and conformal solar, deployable and conformal radiators, 10 kWe surface and 100 kWe orbital fission, heat-pipe boom, fuel cell and battery slot items (Small / Medium), regenerative fuel cell plant, PMAD slot item, high-gain dish, phased array, omni, optical terminal, surface solar tower.
- **B8 Rover hub system** (AX-rover-01..24, 24 / 38): one hub standard (**1.0 m hatch, 2.5 m width**): 2- / 4-seat and open front cabs, rear cabin / back-seat / temporary-station hubs, airlock, cargo, utility and lab mid hubs, articulated connector, hub docking ring; S/M/L chassis frames, articulation joint, airless wheel, suspension, steering, hub motor, blade, arm, drill, cargo bed.
- **B9 Jets & spaceplanes** (AX-aero-01..35, 35 / 74): delta / swept wings, strake, connector, tails, canard, elevon, rudder, flap, body flap; high-bypass and afterburning turbofans, turbojet, precooled combined-cycle, scramjet; shock-cone, ramp, radial and NACA intakes; Mk1 / Mk2 / Mk3 cockpits, spaceplane nose, lifting-body cabin; Mk1 / Mk2 / Mk3 fuel, cargo and passenger fuselages, adapters, tail cone.
- **B10 RCS, robotics, science & utility** (AX-util-07..30, 24 / 45): flush and recessed RCS, gas-gas, cold-gas, vernier pods, parachute pack, Sabatier plant, flood light, umbilical, Whipple shield, sunshade, hinge, rotary bearing, linear actuator, station arm, end effector; science slot items (spectrometer, seismometer, weather station, imager, radiation monitor, ground radar: Small; sample analysis and biology racks: Rack).

### Interiors
9 more of Sergei's finished interiors (now 26 interiors / 32 variants): the gravity ring `station09`-`station13` and the surface habs / rovers `rover03`, `rover10`, `rover11`, `rover24`. `rover12_interior` stays in `interiors_skipped` (built against an unreleased rover12 exterior revision). AX parts have no released interiors yet (IVA data handed to the interior team).

### Docs and tests
- `AGENT_HANDOFF.md` §14 "AX line" (filter by line, ids, redirects, gravity ring, rover hubs, slots); interiors table; `vehicle_creation_spec.md` lookup step 0 (redirects) and the new test vehicles.
- Test vehicles `ax_ares_hopper` and `ax_capsule_stack` (7 crafts in total, all 0 errors / 0 warnings; `reference_builder.py` matches).
- New `handoff/tools/update_zips.py` (adds / refreshes part GLBs + nodes in the two zips); `import_interiors.py` include list.

### Known limits
- Most AX variants have `mass_estimated: true` (only 32 have designed masses).
- `assemble.js` centres a part's overlap box between its stack nodes; parts whose box is not centred there (AX heat shields, SM-L, boat tails, some jets) can be flagged as overlapping in an explicit stack joint.
- AX-cmd-01 (= cmd11 geometry) outer seats keep 0.023 m feet clearance for the 1.8 m envelope (left as is: the interior team's cmd11 interior is laid out on those seats).
- The low-poly zip is now 69 MB (GitHub warns above 50 MB).

### Added
- `ax_aero_01` CK-1X Single-Seat Jet Cockpit
- `ax_aero_02` CK-2X Mk2 Two-Seat Cockpit
- `ax_aero_03` CK-2I Mk2 Inline Cockpit
- `ax_aero_04` CK-3X Mk3 Flight Deck
- `ax_aero_05` CK-3S Mk3 Spaceplane Nose
- `ax_aero_06` CK-LB Lifting-Body Crew Cabin
- `ax_aero_07` FS-1 Mk1 Fuselage
- `ax_aero_08` FS-2X Mk2 Fuel Fuselage
- `ax_aero_09` FS-2C Mk2 Cargo Bay
- `ax_aero_10` FS-2P Mk2 Passenger Cabin
- `ax_aero_11` FS-2A Mk2 to M Adapter
- `ax_aero_12` FS-3X Mk3 Fuel Fuselage
- `ax_aero_13` FS-3C Mk3 Cargo Bay
- `ax_aero_14` FS-3P Mk3 Passenger Cabin
- `ax_aero_15` FS-3A Mk3 to L Adapter
- `ax_aero_16` FS-TC Tail Cone (Mk2 / Mk3)
- `ax_aero_17` WG-D Delta Wing
- `ax_aero_18` WG-S Swept Wing Panel
- `ax_aero_19` WG-K Strake
- `ax_aero_20` WG-C Wing Connector
- `ax_aero_21` TL-V Vertical Tail
- `ax_aero_22` TL-C Canard
- `ax_aero_23` CS-E Elevon
- `ax_aero_24` CS-R Rudder / Speed Brake
- `ax_aero_25` CS-F Flap
- `ax_aero_26` CS-BF Body Flap / Airbrake
- `ax_aero_27` JE-HB High-Bypass Turbofan
- `ax_aero_28` JE-AB Afterburning Low-Bypass Turbofan
- `ax_aero_29` JE-TJ Small Turbojet
- `ax_aero_30` JE-PC Precooled Combined-Cycle Engine
- `ax_aero_31` JE-SC Scramjet Module
- `ax_aero_32` IN-SC Inline Shock-Cone Intake
- `ax_aero_33` IN-RP Mk2 Conformal Ramp Intake
- `ax_aero_34` IN-RD Radial Intake
- `ax_aero_35` IN-NA Flush NACA Intake
- `ax_cmd_01` CM-8 'Ares' Crew Capsule
- `ax_cmd_02` CM-2X 'Kestrel' Two-Seat Capsule
- `ax_cmd_03` CM-12 'Ares Heavy' Six-Seat Capsule
- `ax_cmd_04` AC-4 'MAV' Ascent Cabin
- `ax_cmd_05` LC-3 Lunar Lander Crew Cabin
- `ax_cmd_06` OT-1 Orbital Tug Cab
- `ax_cmd_07` CD-7 Command Deck Section
- `ax_cmd_08` CG-L 'Ares' Cargo Capsule
- `ax_cmd_09` PC-XS Faceted Probe Core
- `ax_cmd_10` PC-S Octagonal Probe Bus
- `ax_cmd_11` PC-MX Avionics Ring
- `ax_cmd_12` ST-L Capsule Service Trunk
- `ax_cmd_13` SM-L Capsule Service Module
- `ax_cmd_14` LES-S Launch Escape Tower
- `ax_cmd_15` HS-1 Ablative Heat Shield Set
- `ax_cmd_16` HIAD-1 Inflatable Decelerator
- `ax_gear_01` LG-N Retractable Nose Gear
- `ax_gear_02` LG-M Retractable Main Gear
- `ax_gear_03` LG-H Heavy Bogie Gear
- `ax_gear_04` LL-T Telescoping Lander Leg
- `ax_gear_05` LL-F Booster Fold-Up Leg
- `ax_gear_06` LL-SK Fixed Skid Strut
- `ax_gear_07` SR-AX Structural Strut
- `ax_gear_08` TS-Q Square Truss Segment
- `ax_gear_09` TS-T Triangular Lattice Truss
- `ax_gear_10` TS-J Truss Junction Cube
- `ax_gear_11` BM-1 Chamfered I-Beam / Girder
- `ax_gear_12` DB-1 Deployable Boom
- `ax_grav_01` GR-HB Despun Hub
- `ax_grav_02` GR-CRX Counter-Rotating Bearing Assembly
- `ax_grav_03` GR-SP Pressurised Spoke / Elevator
- `ax_grav_04` GR-ST Truss Spoke
- `ax_grav_05` GR-RH Ring Segment: Habitat
- `ax_grav_06` GR-RL Ring Segment: Laboratory
- `ax_grav_07` GR-RG Ring Segment: Greenhouse
- `ax_grav_08` GR-RS Ring Segment: Storage / Utility
- `ax_grav_09` GR-RB Ring Segment: Bulkhead / Airlock
- `ax_grav_10` GR-CW Counterweight / Ballast Segment
- `ax_grav_11` GR-SD Spin Drive / Rim Motor
- `ax_grav_12` GR-MA Hub Power & Radiator Mast
- `ax_power_01` PV-RO Roll-Out Solar Array
- `ax_power_02` PV-RG Rigid Solar Wing
- `ax_power_03` PV-UF Circular Fan Array
- `ax_power_04` PV-CF Conformal Skin Panel
- `ax_power_05` RD-DP Deployable Radiator
- `ax_power_06` RD-CF Conformal Radiator Panel
- `ax_power_07` FR-10 Fission Surface Reactor 10 kWe
- `ax_power_08` FR-100 Orbital Fission Reactor 100 kWe
- `ax_power_09` HP-1X Heat-Pipe Radiator Boom
- `ax_power_10` FC-1X Fuel Cell
- `ax_power_11` BT-1 Battery Module
- `ax_power_12` RF-1 Regenerative Fuel Cell Plant
- `ax_power_13` PM-1 Power Management Unit
- `ax_power_14` HG-1X High-Gain Dish
- `ax_power_15` PA-1 Conformal Phased-Array Panel
- `ax_power_16` LG-1 Low-Gain / Omni Antenna
- `ax_power_17` OC-1 Optical Comms Terminal
- `ax_power_18` PV-VT Vertical Surface Solar Tower
- `ax_prop_01` LE-13 'Raptor-V' Vacuum Methalox
- `ax_prop_02` LC-1 'Hopper' Landing Cluster
- `ax_prop_03` LE-14 'Spike-L' Aerospike Booster
- `ax_prop_04` LE-11X 'Raptor-S' Sea-Level Methalox
- `ax_prop_05` BC-9 Booster Engine Cluster Plate
- `ax_prop_06` LE-21 'Kite' Small Vacuum Methalox
- `ax_prop_07` LE-22 'Kite-S' Small Sea-Level Methalox
- `ax_prop_08` OE-1 Hypergolic OMS Engine
- `ax_prop_09` LE-15 'Descent' Deep-Throttle Lander Engine
- `ax_prop_10` HV-1 Hydrolox Vacuum Engine
- `ax_prop_11` HB-1 Hydrolox Booster Engine
- `ax_prop_12` LS-1X Linear Aerospike
- `ax_prop_13` SRB-AX Segmented Solid Booster
- `ax_prop_14` KM-1 Solid Kick Motor
- `ax_prop_15` NTR-1X Nuclear Thermal Rocket
- `ax_prop_16` HT-1X Hall Thruster Cluster
- `ax_prop_17` GI-1 Gridded Ion Thruster
- `ax_prop_18` AP-1 Abort Engine Pod
- `ax_prop_19` VR-1 Vernier / Roll-Control Engine
- `ax_prop_20` EM-3 Multi-Engine Thrust Structure
- `ax_rover_01` RH-F2 Front Cab Hub, 2-Seat
- `ax_rover_02` RH-F4 Front Cab Hub, 4-Seat
- `ax_rover_03` RH-FO Front Open Driving Station
- `ax_rover_04` RH-RC Rear Hub: Cabin
- `ax_rover_05` RH-RS Rear Hub: Back Seats
- `ax_rover_06` RH-RT Rear Hub: Temporary Station
- `ax_rover_07` RH-MA Mid Hub: Airlock / Suitports
- `ax_rover_08` RH-MC Mid Hub: Pressurised Cargo
- `ax_rover_09` RH-MU Mid Hub: Utility
- `ax_rover_10` RH-ML Mid Hub: Science Lab
- `ax_rover_11` RH-DC Articulated Hub Connector
- `ax_rover_12` RH-DK Hub Docking Ring
- `ax_rover_13` RC-S Chassis Frame S (2 wheels)
- `ax_rover_14` RC-M Chassis Frame M (4 wheels)
- `ax_rover_15` RC-L Chassis Frame L (6 wheels)
- `ax_rover_16` RC-AJ Chassis Articulation Joint
- `ax_rover_17` RW-1X Airless Wheel
- `ax_rover_18` RS-1 Active Suspension Module
- `ax_rover_19` RS-2 Steering Module
- `ax_rover_20` RM-1X Hub Drive Motor
- `ax_rover_21` RT-BL Regolith Blade
- `ax_rover_22` RT-AR Rover Robotic Arm
- `ax_rover_23` RT-DR Coring Drill
- `ax_rover_24` RT-CB Cargo Bed / Flatbed
- `ax_station_01` HB-L 'Harbor' Core Hab
- `ax_station_02` HB-M Compact Hab
- `ax_station_03` ND-6 Six-Port Node
- `ax_station_04` AL-2 Dual Airlock
- `ax_station_05` CU-1 Faceted Cupola
- `ax_station_06` LB-L Laboratory Module
- `ax_station_07` LG-L Pressurised Logistics Module
- `ax_station_08` IH-XL Inflatable Hab
- `ax_station_09` SV-L Station Service Module
- `ax_station_10` GH-L Greenhouse Module
- `ax_station_11` WS-L Workshop / Fabrication Module
- `ax_station_12` CC-L Station Command Module
- `ax_station_13` CQ-L Crew Quarters Module
- `ax_station_14` SS-M Storm Shelter
- `ax_station_15` SH-L Surface Hab
- `ax_station_16` DM-XL Inflatable Surface Dome
- `ax_station_17` SA-M Surface Airlock / Suitport
- `ax_station_18` TR-AX Station Truss Segment
- `ax_struct_01` AD-SM Faceted Adapter S-M
- `ax_struct_02` AD-ML Faceted Adapter M-L
- `ax_struct_03` AD-LX Faceted Adapter L-XL
- `ax_struct_04` AD-XX Faceted Adapter XL-XXL
- `ax_struct_05` AD-SK Skip Adapters
- `ax_struct_06` SD-1 Stack Decoupler
- `ax_struct_07` HS-R Hot-Staging Ring
- `ax_struct_08` RD-1 Radial Decoupler
- `ax_struct_09` PF-1 Payload Fairing
- `ax_struct_10` TA-L Capsule Trunk Adapter Ring
- `ax_struct_11` BS-1 Engine Boat-Tail Skirt
- `ax_struct_12` SB-1X Structural Service Bay
- `ax_struct_13` NC-1X Faceted Nose Cone
- `ax_struct_14` MM-1 Multi-Mount Plate
- `ax_struct_15` AE-1X Entry Aeroshell + Backshell
- `ax_struct_16` PL-1 Payload Adapter / Clamp Band
- `ax_tank_01` T-M4 Modern Methalox Tanks
- `ax_tank_02` T-LS Lander Tank Section
- `ax_tank_03` T-M5 Heavy Methalox Barrels
- `ax_tank_04` T-HD Header Tank Section
- `ax_tank_05` T-H2 Hydrolox Tanks
- `ax_tank_06` T-HY Hypergol Sphere Section
- `ax_tank_07` T-XE Xenon COPV Cluster
- `ax_tank_08` T-TR Toroidal Tank
- `ax_tank_09` T-RD Radial Drop Tank
- `ax_tank_10` T-DPX Propellant Depot Core
- `ax_tank_11` T-W Water / Shielding Tank
- `ax_tank_12` T-OX ISRU Oxygen Tank
- `ax_tank_13` T-MP Green Monoprop Tank
- `ax_tank_14` T-HE Helium COPV (radial)
- `ax_tank_15` CT-1 Cryo Transfer Module
- `ax_tank_16` T-LS2 Lander Tank Section M / XL
- `ax_util_01` DP-S IDSS Androgynous Docking Port
- `ax_util_02` DP-XSX Compact Docking Port
- `ax_util_03` DP-CB Common Berthing Ring
- `ax_util_04` DP-AD Docking Adapter
- `ax_util_05` DP-L Heavy Cargo Port
- `ax_util_06` GF-1X Grapple Fixture
- `ax_util_07` RCS-P Flush RCS Pocket Panel
- `ax_util_08` RCS-QX Recessed RCS Quad
- `ax_util_09` RCS-G Methalox Gas-Gas Thruster
- `ax_util_10` RCS-C Cold-Gas Thruster
- `ax_util_11` RCS-V Vernier Pod
- `ax_util_12` RB-H Hinge
- `ax_util_13` RB-R Rotary Bearing
- `ax_util_14` RB-P Linear Actuator
- `ax_util_15` RB-A Station Robotic Arm
- `ax_util_16` RB-E End Effector / Tool Changer
- `ax_util_17` SC-SP Spectrometer
- `ax_util_18` SC-SE Seismometer Package
- `ax_util_19` SC-WX Weather Station
- `ax_util_20` SC-LB Sample Analysis Rack
- `ax_util_21` SC-IM Imager / Camera
- `ax_util_22` SC-RM Radiation Monitor
- `ax_util_23` SC-GR Ground-Penetrating Radar
- `ax_util_24` SC-BI Biology Rack
- `ax_util_25` UT-PC Parachute Pack
- `ax_util_26` UT-LT Flush Flood Light
- `ax_util_27` UT-IS ISRU Sabatier Plant
- `ax_util_28` UT-UM Propellant Transfer Umbilical
- `ax_util_29` UT-WS Whipple MMOD Shield Panel
- `ax_util_30` UT-SS Deployable Sunshade
- `rover03_interior` RV-4 Pressurised Rover
- `rover10_interior` SH-1 Surface Hab (Rigid)
- `rover11_interior` SH-2 'Hab' Inflatable Dome
- `rover24_interior` CB-P Pressurised Rover Cab
- `station09_interior` GR-HUB Spin Hub & Bearing
- `station10_interior` GR-SPK Spoke / Elevator Tube
- `station11_interior` GR-SEG Ring Segment
- `station12_interior` GR-CR Counter-Rotating Ring
- `station13_interior` GR-DS Despun Core Section

## [0.3.0] - 2026-10-01

This is the first versioned release; earlier states of the repo were unversioned. It has 188 parts / 509 variants in 13 categories, 17 interiors (21 variants) and 2 assemblies. Tag `parts-v0.3.0`.

### Parts
- **Categories:**
  - 188 parts / 509 GLB variants in 13 categories: cmd 11, prop 27, tank 14, stage 18, station 17, power 18, rover 40, jet 13, cockpit 6, aero 8, struct 5, robo 4, sci 7.
  - 108 of the parts are original; 80 were added on 2026-10-01. The additions are the new categories `aero`, `struct`, `robo` and `sci`, the rover kit rover13–39, and additions to prop, tank, stage, station, power and jet.
  - There are also 2 reference assemblies: the gravity ring and the counter-rotating ring.
- **LODs and zips:**
  - The default is game-ready low-poly (≤ 5,000 triangles per variant, shared 35-material PBR library). The CAD meshes are also included, with identical origins and nodes.
  - Zips: `space_sim_lowpoly_glb_v2.zip`, `space_sim_glb_v3.zip`.

### Changed
- **`cockpit00`, `cockpit01`: canopies raised for 1.8 m crew** at a 30° seat recline. The minimum head clearance is now cockpit00 5.4 cm, cockpit01 front 5.4 cm and rear 5.3 cm. Affected variants are `cockpit00_fighter_canopy`, `cockpit00_fighter_canopy_open`, `cockpit01_tandem_canopy` and `cockpit01_tandem_canopy_open`. CAD and low-poly GLBs, nodes, thumbnails and both zips were rebuilt.

### Fixed (Vehicle Creation builder, `assemble.js`; spec in `vehicle_creation_spec.md`)
1. **Antiparallel flip for ±Y nodes:** `quatFromTo` used `a.x` where three.js uses `a.y`, so it produced a zero quaternion. As a result, a part hung by `node_bottom` from a −Y node (e.g. `node_under_R_C`) was not flipped. It now matches `setFromUnitVectors`.
2. **Rover kit and deck joints kept as written:** explicit `node_attach` joints onto `node_outboard[_N]`, `node_rail_l/r_K|c`, `node_grid_R_C`, `node_under_R_C`, `node_front`, `node_rear` and `node_hitch` are no longer discarded and laid out beside the craft. The same applies to stack faces on deck, payload and `node_bottom_N` nodes.
3. **Unique instance ids under nested symmetry:** a symmetric child of a copied parent used to reuse an id (`fin@2` twice). Copies are now `<seed><suffix>~k` for every k, e.g. `fin@2~1`, `fin@2~2`.

New regression tests for all three are in `tools/test_assemble.mjs`.

### Added
- **`handoff/`:**
  - `AGENT_HANDOFF.md`, a `CONVENTIONS.md` copy, `parts_manifest.json` (schema v2: `manifest_version`, `generated_at`, per-file sha256, per-id `content_hash` / `meta_hash`) and `vehicle_creation_spec.md` (with a GDScript porting guide).
  - `test_vehicles/`: 5 crafts plus expected world-space results.
  - `materials_library.json`.
  - Tools: `build_manifest.py`, `build_test_vehicles.mjs`, `reference_builder.py`, `sync_to_godot.py` (re-sync by hash), `import_interiors.py` and `publish_update.py`.
- **Interiors (IVA), 17 parts / 21 variants**, linked to their exterior part ids:
  - **Ids:** `cmd03_interior`, `cmd04_interior`, `cmd05_interior`, `cmd06_interior`, `cmd07_interior`, `cmd08_interior`, `cmd09_interior`, `cockpit00_interior`, `cockpit01_interior`, `cockpit02_interior`, `cockpit03_interior`, `cockpit04_interior`, `station00_interior`, `station01_interior`, `station02_interior`, `station03_interior`, `station04_interior`.
  - **Files:** in `models/interiors/`. Each interior has `<vid>_interior.glb` (interior only, same origin as the exterior), `_combined.glb` and `_cutaway.glb` for review, plus `<id>_interior.nodes.json` with the seat, camera and hatch nodes.
  - **Known issues:** in `cockpit02_interior` the crew does not fit; heads go 2.6–3.2 cm into the ceiling because the exterior deck is 1.26–1.28 m high. In `cockpit03_interior` the pilots fit only within tolerance (−0.2 cm).
  - **Not released yet:** `station09`–`station13` (gravity-ring interiors, still in progress) and the interior props library (the props are already embedded in the interior GLBs).
- **GitHub label `game-request`** for change requests from the game.
