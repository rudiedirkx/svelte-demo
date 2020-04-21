<script>
import BlockedCourtsTable from './BlockedCourtsTable.svelte';
import BlockReservationsTable from './BlockReservationsTable.svelte';

const int = (min, max) => parseInt(Math.random() * (max - min + 1)) + min;
const id = () => int(1, 1e6);
const word = (ucfirst = false) => {
	const words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet'];
	let word = words[int(0, words.length - 1)];
	if (ucfirst) {
		word = word.replace(/^./, m => m.toUpperCase());
	}
	return word;
};
const court = () => `${word(true)} ${int(1, 5)}`;
const player = () => `${word(true)} ${word(true)}`;

let blockedCourts = [
	{id: id(), court: 'Lorem 1'},
	{id: id(), court: 'Amet 2'},
];
let blockReservations = [
	{id: id(), court: 'Lorem 2', player: 'Amet Ipsum'},
	{id: id(), court: 'Lorem 1', player: 'Ipsum Lorem'},
];

const bcAdd = e => {
	blockedCourts = [...blockedCourts, {id: id(), court: court()}];
	console.log('blockedCourts', blockedCourts);
};
const brAdd = e => {
	blockReservations = [...blockReservations, {id: id(), court: court(), player: player()}];
	console.log('blockReservations', blockReservations);
};
</script>

<h1>BR records ({blockedCourts.length + blockReservations.length})</h1>

<h2>Blocked courts ({blockedCourts.length})</h2>

<BlockedCourtsTable rows={blockedCourts} onAdd={bcAdd} />

<h2>Block reservations ({blockReservations.length})</h2>

<BlockReservationsTable rows={blockReservations} onAdd={brAdd} />
