// The story of the territory, 1899: what the Black Ichor is, who let it loose, and where a cure might be.
// Every note, letter, report and notice a rider can find. Bodies are plain text; blank lines separate paragraphs.
export const LORE = {
  // ---- the start: the telegram that sets the journey ----
  telegram: {
    title: 'Telegram for any living soul',
    body: `WESTERN UNION · GLACIER POINT TO ALL STATIONS · 14 NOV 1899

TO ANYONE STILL BREATHING ON THE LINE STOP I AM DR ELEANOR HARTWELL STOP I CAN MAKE A CURE FOR THE ICHOR STOP

THE APPARATUS AT MY INSTITUTE NEEDS THREE THINGS STOP ONE VOLTS FORMULA FROM HIS STATION IN THE MOUNTAINS STOP TWO A PURE SAMPLE OF ICHOR FROM THE OIL WORKS IN THE BADLANDS STOP THREE THE HEARTSTONE WHICH LIES BENEATH THE BAYOU STOP BLACK JACK MERCER KNOWS WHERE STOP

THE INSTITUTE IS SEALED STOP CROWE HOLDS MY KEY IN THE VAULT AT FORTUNE STOP TAKE THE JUPITER EAST STOP GOD KEEP YOU STOP`,
  },
  // ---- Fortune and the First Territorial Bank ----
  fortuneNews: {
    title: 'The Fortune Gazette, 3 March 1898',
    body: `BLACK GOLD! FORTUNE TO BOOM

Mr. Silas Crowe, President of the First Territorial Bank, announced yesterday that his Ichor Oil Works in the badlands has struck "a seep the like of which the world has never seen."

The oil, said to be unusually dark and warm to the touch, will be bottled as Crowe's Ichor Tonic, sold at fifty cents and guaranteed to cure rheumatism, melancholy and the grippe.

"Within a year," said Mr. Crowe, "every man in Fortune will be rich, or a fool."`,
  },
  tellerNote1: { title: "Teller's slip (first window)", body: `Mr. Pike, the vault dials were reset after the robbery scare. Write nothing down, he says. So I am writing it here where no one looks.\n\nDIAL ONE: 4\n\n— E.` },
  tellerNote2: { title: "Ledger, loans office", body: `Loan to Ichor Oil Works: $48,000. Loan to Volt Research Station: $22,000. Loan to Crowe's Tonic Co.: $9,500.\n\nAll signed by Crowe, to Crowe.\n\nIn the margin, in pencil: "dial two is 7. God forgive this bank."` },
  tellerNote3: { title: "Note pinned under the manager's blotter", body: `The President has locked himself in the vault with his money. He has not come out in nine days. We hear him counting.\n\nThe last number is 2. If you go in, take a gun.` },
  crowe: { title: 'Letter from Dr. Hartwell to Silas Crowe', body: `Silas,\n\nI send you the only key to my Institute because your vault is the safest place in the territory, and because you owe me that much.\n\nYour tonic has killed half the county. Volt has told me everything. Keep the key safe until I send for it. If you have any decency left, you will burn every bottle.\n\n— Eleanor Hartwell` },
  vault: { title: "Crowe's last entry", body: `Day 11. The tonic keeps me well. I am stronger than I have ever been. The clerks have stopped screaming. They help me count now.\n\n$1,204,611.\n\nNobody takes it. Nobody takes any of it.` },
  // ---- the cathedral ----
  sisterAgnes: { title: "Sister Agnes's journal", body: `They come to the doors at night and do not knock. Father Moran says they are only sick. Father Moran went out to them on Sunday.\n\nThe spiral sign is cut into the old foundation stones beneath the altar. It was there before we built here. The Spanish monks left a warning beside it: "lo que duerme bajo el pantano" — what sleeps beneath the marsh.` },
  sermon: { title: 'Sermon notes, Father Moran', body: `"And the waters became as black as blood." Revelation, chapter eight? Check.\n\nThe Ichor is not oil. It is not sickness. It is a thing that wants. I have seen it crawl across a pew to a sleeping child.` },
  crypt: { title: 'Plaque in the crypt', body: `Here lies St. Agnes of the Sorrows, who kept the dead in their graves for forty days and nights in the winter of 1899, and asked that her relic be kept beneath this church until the curse is lifted.` },
  palemass: { title: 'Scratched into the pew', body: `They come back at night to pray. They do not know they are dead. Do not stay after the bell.` },
  // ---- the outlaws ----
  wanted: { title: 'WANTED: Black Jack Mercer', body: `$5,000 DEAD OR ALIVE\n\nFor the robbery of the Hartwell Institute medical shipment at Mile 3, the murder of two guards and the theft of the territory's only supply of antitoxin.\n\nLast seen heading for the badlands with nine men.` },
  outlawLetter: { title: 'Letter in a saddlebag', body: `Ma,\n\nBlack Jack says the medicine we took is worth more than gold. Then he drank a bottle himself and his eyes went black at the edges and he laughed for an hour.\n\nHe keeps a map in his coat. He says there is something under the bayou that the Ichor comes from and that whoever holds it will be king of the dead.\n\nI am coming home. — Tommy` },
  prisoner: { title: "Deputy Ruth Calder's statement", body: `I was taken at Mile 3 with the Hartwell shipment. Mercer drank the antitoxin and the Ichor both, to see which would win.\n\nHe wants the Heartstone. His map is in his coat. Kill him and take it; there's nothing of the man left to save.` },
  // ---- the farms ----
  hollis: { title: 'Letter from Martha Hollis', body: `Dear Sister,\n\nJacob bought the tonic for the cough. It worked, at first. Now he will not come in from the barn and the horses scream at night. I have let them all loose. Let them run.\n\nIf you see a grey mare with a white blaze, that is Clementine. She will come to you if you are kind.` },
  redwater: { title: 'Redwater Ranch tally book', body: `Cattle lost this month: 212. Horses run off: 14. Hands run off: 6. Hands that came back wrong: 3.\n\nBurned the tonic. Should have burned it in March.` },
  whitfield: { title: 'Whitfield Stud breeding ledger', body: `Night Mare (black, by Ironclad) — sold to the Hartwell Institute, $400, for "serum trials". Returned in a week. Would not eat. Destroyed.\n\nWe will not sell them another.\n\nTurned the black string out into the timber the night the hands took sick. The dead do not chase what they cannot catch. Come quiet and bring oats, and the blacks may let you near.` },
  // ---- the laboratory ----
  voltLog1: { title: "Dr. Volt's laboratory log, 2 Feb 1899", body: `Crowe's "oil" is alive. Under the microscope the Ichor behaves as a colony: it moves towards warmth and towards blood, and it can drive a body long after the heart has stopped.\n\nIt is, however, exquisitely sensitive to alternating current. At 40,000 volts it simply dies.` },
  voltLog2: { title: "Dr. Volt's laboratory log, 19 Mar 1899", body: `I have the formula: current, timing and a reagent to carry it through the blood. A living man could be cleansed.\n\nCrowe refuses to fund the cure. He says a cure would ruin the tonic trade. I have written to Dr. Hartwell instead.` },
  voltLog3: { title: "Dr. Volt's laboratory log, last page", body: `I tested the cleansing current on myself. I was already infected; the dynamo was not strong enough.\n\nThe Ichor and the current are now both in me. I can feel the lightning in my fingers.\n\nTo whoever reads this: restore the three breakers, open the core, and take the formula from my desk. Do not let me stop you. I will try.` },
  labNotice: { title: 'Station notice', body: `VOLT RESEARCH STATION\nAUTHORISED PERSONNEL ONLY\n\nThe main power is controlled by three breakers: GENERATOR HALL, COIL LABORATORY and STORES. All three must be closed to open the core blast door.` },
  labReport: { title: 'Specimen report No. 41', body: `Subject (ranch hand, male, approx. 30) was given 1 oz. of Ichor Tonic. Death at 6 hours. Reanimation at 9 hours. Subject attracted to the coils and could not be harmed by current below 2,000 volts.\n\nSubjects 38 to 44 are kept in the coil laboratory. Do not open their pens.` },
  // ---- the refinery ----
  refinery1: { title: 'Ichor Oil Works safety notice', body: `NO SMOKING · NO NAKED FLAME · NO WORKING THE PIT AFTER DARK\n\nRed barrels are full of refined spirit. They will explode if struck.\n\nThe gas valves on the east and west stills must be closed if the leak whistle sounds.` },
  refinery2: { title: "Foreman's diary", body: `The pit is breathing. I swear it. The tar rises a foot every night and something moves under it, big as a boxcar.\n\nThe men who fell in came back out. They came back out black.` },
  refinery3: { title: 'Telegram to Fortune', body: `CROWE STOP THE SEEP IS NOT OIL STOP IT IS SOMETHING OLD AND IT IS WAKING STOP RECOMMEND WE CAP THE PIT AND BURN THE WORKS STOP AWAITING INSTRUCTION STOP\n\n(Reply, pencilled on the back: "Keep pumping. — S.C.")` },
  // ---- the catacombs ----
  catacomb1: { title: 'Spanish inscription, translated', body: `Here the brothers of San Miguel sealed the Pale One in the year of Our Lord 1687.\n\nIts heart is a red stone. While the stone lies in the dark the dead will not rest; whoever carries it into the light holds the cure and the curse together.` },
  catacomb2: { title: 'The spiral', body: `The same spiral the dead scratch into the walls of every town on the line is carved here, a thousand times, on every surface. Here it is painted in something dark and old.\n\nThree levers stand in the walls, each marked with a smaller spiral.` },
  catacomb3: { title: 'Bones of a Spanish brother', body: `A rosary and a scrap of vellum: "El guardián duerme. La llave de hueso la lleva el centinela." The guardian sleeps. The sentinel carries the bone key.` },
  // ---- the institute ----
  hartwell1: { title: "Dr. Hartwell's last note", body: `If you have come this far, you have the key.\n\nPlace the Formula, the Sample and the Heartstone in the three cradles of the apparatus. The current will do the rest. I am not well enough to throw the switch myself.\n\nThank you, whoever you are.` },
  hartwell2: { title: 'Institute notice', body: `HARTWELL INSTITUTE FOR TROPICAL & BLOOD DISEASES\n\nVisitors are reminded that the cold-store is kept at −20°C. Do not enter without a coat.` },
  ending: {
    title: 'The cure',
    body: `The three cradles lock. The dynamo spins up with a scream, and blue fire races along the copper from the Formula, through the black Sample, to the Heartstone, which flares red and then white.

Out on the mountainside the dead stop walking. Not all of them, and not forever, but here, now, for a moment, the snow is quiet.

On the bench, a rack of glass vials fills slowly with something clear. Enough for a town. Enough to start.

The territory is still out there. So is the line. The Jupiter is waiting.`,
  },
  // ---- the line: notices and letters found at stations and camps ----
  quarantine: { title: 'Notice of quarantine', body: `BY ORDER OF THE TERRITORIAL GOVERNOR\n\nAll persons showing black veins, fever or an aversion to light are to be confined. All stocks of CROWE'S ICHOR TONIC are to be surrendered for burning.\n\nThe railroad will run until further notice.` },
  timetable: { title: 'Revised timetable', body: `ALL SERVICES SUSPENDED.\n\nThe Jupiter (No. 9) is left at Dry Gulch with coal and orders to run east if anyone fit to drive her should come.` },
  photo1: { title: 'Photograph: the Fortune bank opening', body: `[A tintype. Men in good suits stand on the steps of a grand brick bank. At the centre, a tall thin man in a top hat holds up a bottle of tonic. On the back: "S. Crowe, Opening Day, '97."]` },
  photo2: { title: 'Photograph: the station staff', body: `[Six men and a woman in front of a tall coil, all in white coats. One wears thick goggles pushed up on his forehead. On the back: "Volt Research Station, winter '98. E.H. visiting."]` },
  photo3: { title: 'Photograph: the gang', body: `[Nine riders on a ridge. The man in the centre wears a black coat and two pistols, and his face has been scratched out with a knife.]` },
  survivor: { title: "Survivors' note", body: `Seven of us here three nights. Fire keeps them off. Old Pete says they don't like the light, nor fire, nor running water.\n\nHeading for Glacier Point. They say there's a doctor.` },
};
// notices put up at every station along the line, in turn
export const STATION_LORE = ['quarantine', 'timetable', 'survivor'];
