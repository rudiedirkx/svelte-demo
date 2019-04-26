<script>
import BlockedCourtsTable from './BlockedCourtsTable.svelte';
import BlockReservationsTable from './BlockReservationsTable.svelte';

let blockedCourts = [
	{id: 3, court: 'Lorem 1'},
	{id: 4, court: 'Amet 2'},
];
let blockReservations = [
	{id: 5, court: 'Lorem 2', player: 'Amet Ipsum'},
	{id: 11, court: 'Lorem 1', player: 'Ipsum Lorem'},
];

const bcAdd = e => {
	blockedCourts.push({court: 'tmp'});
	console.log({blockedCourts});
};
const brAdd = e => {
	blockReservations.push({court: 'tmp'});
	console.log({blockReservations});
};
</script>

<h1>BR records ({blockedCourts.length + blockReservations.length})</h1>

<h2>Blocked courts ({blockedCourts.length})</h2>

<BlockedCourtsTable rows={blockedCourts} onAdd={bcAdd} />

<h2>Block reservations ({blockReservations.length})</h2>

<BlockReservationsTable rows={blockReservations} onAdd={brAdd} />
