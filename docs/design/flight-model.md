# Flight model tuning

The published numbers below describe real aircraft, usually at altitude and in particular configurations. They are **references for relative roles**, not values inserted directly into the Lyon simulation. Public sources do not provide a complete set of comparable turn rates, roll rates, energy loss, or flight-control laws for these seven variants. The game's speeds are compressed to keep city flight playable; HUD knots describe that game speed.

| Game aircraft | Published reference | Handling used in the game |
| --- | --- | --- |
| F-22 Raptor | [USAF: Mach-two class, supercruise, thrust-vectoring nozzles](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/dom/prime/src/f-22-raptor/) | Strong acceleration and sustained energy, with high-alpha nose authority. |
| F-35A Lightning II | [USAF: Mach 1.6 and 9-g capable](https://www.afnwc.af.mil/About-Us/Fact-Sheets/Article/2074660/f-35a-lightning-ii/) | Stable multirole response, less roll authority than the light F-16. |
| Su-57 | [UAC: stable handling at subsonic, supersonic, and post-stall angles of attack](https://www.uacrussia.ru/en/aircraft/lineup/military/su-57/) | Strong high-alpha maneuvering and acceleration. UAC does not publish a comparable numeric maximum speed on this page. |
| Su-35 | [UAC: thrust vector control and Mach 2.25 at altitude](https://uacrussia.ru/en/aircraft/lineup/military/su-35/); [Rosoboronexport: 9-g maximum maneuver load](https://roe.ru/pdfs/pdf_4667.pdf) | Highest high-alpha nose authority, with greater energy loss in hard turns. |
| F-15E Strike Eagle | [USAF: Mach 2.5+ and high thrust-to-weight ratio](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104499/f-15e-strike-eagle/) | Fastest top end, strong acceleration and energy retention, heavier control response. |
| F-16 Fighting Falcon | [USAF: Mach 2, 9-g capable, fly-by-wire control](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104505/f-16-fighting-falcon/force_isolation/f-16-fighting-falcon/) | Fastest roll and crisp response, with more speed loss in hard turns than the F-22. |
| A-10C Thunderbolt II | [USAF: 420 mph maximum and excellent low-speed, low-altitude maneuverability](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104490/a-10c-thunderbolt-ii/) | No afterburner; lower top end and acceleration, but usable normal flight speed and stronger control authority near the ground. |

The A-10 uses a continuous non-afterburning throttle curve. Free flight starts all aircraft at 50% throttle. After a common 0.8 speed scale for city flight, the A-10 starts at about 115 game knots, up from about 82 before the aircraft tuning pass. Its maximum remains below every fighter. The scale also applies to acceleration, stall thresholds, control speed, and game-scale load limits so their relative behavior remains intact.

Pitch and yaw are limited by each profile's game-scale load factor and current speed. Roll has its own rate and acceleration limits. The A-10 reaches its roll authority at a lower speed than the fighters. Thrust-vectoring aircraft can trade energy for a high-alpha nose change; the flight path follows with lag. None of these controls should be treated as a flight training or engineering model.

The G key toggles the air brake. Keeping it on now slows any jet below its profile's stall threshold, even without reducing throttle. A stall progressively weakens pitch, roll, yaw, and flight-path response, and adds a downward sink. Releasing the brake and adding power restores control as speed returns.
