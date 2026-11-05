// The photographs used on the page: one per "How it works" step and one per service card,
// plus the band list kept for the /sketch/photos/ page.
// Alt texts are copied word for word from
// project-notes/jobs/2026-11-04-horse-site/PHOTO-CATALOGUE.md.
// `focus` is the CSS object-position used where a box crops the photograph in the browser.
// `crop` is the edge kept when the photo band cuts a square file for phones at build time
// (sharp's keywords: 'centre', 'top', 'bottom', 'left', 'right').
import type { ImageMetadata } from 'astro';

import bayFenceTrot from '../assets/horses/horse-bay-fence-trot.jpg';
import bayIndoorPat from '../assets/horses/horse-bay-indoor-pat.jpg';
import bayRedJacket from '../assets/horses/horse-bay-red-jacket.jpg';
import baySmilingWoman from '../assets/horses/horse-bay-smiling-woman.jpg';
import blackAutumnFence from '../assets/horses/horse-black-autumn-fence.jpg';
import chestnutFieldRide from '../assets/horses/horse-chestnut-field-ride.jpg';
import chestnutForestGaze from '../assets/horses/horse-chestnut-forest-gaze.jpg';
import chestnutIndoorTrot from '../assets/horses/horse-chestnut-indoor-trot.jpg';
import blackGentleTouch from '../assets/horses/horse-black-gentle-touch.jpg';
import greyGoldenGrass from '../assets/horses/horse-grey-golden-grass.jpg';
import greySunnyTrot from '../assets/horses/horse-grey-sunny-trot.jpg';

export interface SketchPhoto {
  src: ImageMetadata;
  alt: string;
  focus: string;
  crop?: 'centre' | 'top' | 'bottom' | 'left' | 'right';
}

const P = {
  bayFenceTrot: { src: bayFenceTrot, alt: 'Bay horse trots with high steps along a white fence under a helmeted rider', focus: '45% 50%' },
  bayIndoorPat: { src: bayIndoorPat, alt: 'Rider in black leans forward to pat the neck of a bay horse indoors', focus: '55% 50%' },
  bayRedJacket: { src: bayRedJacket, alt: 'Woman in a red jacket stands beside a dark bay horse on a paved yard', focus: '50% 62%' },
  baySmilingWoman: { src: baySmilingWoman, alt: 'Smiling woman in a black sweater stands beside a bay horse with a braided mane', focus: '50% 30%', crop: 'top' },
  blackAutumnFence: { src: blackAutumnFence, alt: "Young woman in a red jacket gently strokes a black horse's face beside an autumn fence", focus: '52% 50%', crop: 'left' },
  chestnutFieldRide: { src: chestnutFieldRide, alt: 'Rider in a cream top on a chestnut horse standing in a field of golden grass', focus: '50% 62%' },
  chestnutForestGaze: { src: chestnutForestGaze, alt: 'Woman in a riding helmet looks up at a bridled chestnut horse among autumn trees', focus: '50% 35%', crop: 'top' },
  chestnutIndoorTrot: { src: chestnutIndoorTrot, alt: 'Chestnut horse in a lifted trot with a helmeted rider inside a riding hall', focus: '58% 60%' },
  blackGentleTouch: { src: blackGentleTouch, alt: 'Woman in a red jacket touches the muzzle of a black horse among autumn trees', focus: '55% 45%' },
  greyGoldenGrass: { src: greyGoldenGrass, alt: 'Woman in a red jacket stands close to a dapple-grey horse beside golden grass', focus: '50% 45%' },
  greySunnyTrot: { src: greySunnyTrot, alt: 'Grey horse trots across a sunny sand arena with a rider, pine trees behind', focus: '50% 80%', crop: 'bottom' },
} satisfies Record<string, SketchPhoto>;

/** Variant A: ten photographs, none of them the hero or the footer photograph; alternating
 *  under saddle / in hand, indoors / outdoors, close / wide, landscape / portrait. */
export const bandPhotos: SketchPhoto[] = [
  P.chestnutIndoorTrot,
  P.baySmilingWoman,
  P.bayFenceTrot,
  P.chestnutForestGaze,
  P.blackAutumnFence,
  P.greySunnyTrot,
  P.bayIndoorPat,
  P.bayRedJacket,
  P.greyGoldenGrass,
  P.chestnutFieldRide,
];

/** Variant B: one photograph per "How it works" step, in step order. */
export const stepPhotos: SketchPhoto[] = [
  P.chestnutForestGaze, // Tell us what you need
  P.bayRedJacket, // Get your selection
  P.chestnutIndoorTrot, // View and test ride
  P.blackAutumnFence, // Vet check, papers, delivery: right up to your stable
];

/** Variant B: one photograph per "Services" card, in card order. */
export const servicePhotos: SketchPhoto[] = [
  P.chestnutFieldRide, // Individual horse search
  P.bayIndoorPat, // Remote support
  P.bayFenceTrot, // Tryout with a Grand Prix rider
  P.blackGentleTouch, // Partnership (greyGoldenGrass carries the photographer's signature,
  //                   so it is kept off the live page until it is cropped)
];

export const isLandscape = (p: SketchPhoto) => p.src.width > p.src.height;
