<script>
import DeleteIcon from './DeleteIcon.svelte';
import AddIcon from './AddIcon.svelte';

export let rows, onAdd, onDelete = null;
</script>

<table border=1 cellspacing=0 cellpadding=10>
	<thead>
		<tr>
			<th>ID</th>
			<th>Player</th>
			<th>Court</th>
			<th><AddIcon onClick={onAdd} /></th>
		</tr>
	</thead>
	<tbody>
		{#each rows as row}
			<tr>
				<td>{row.id}</td>
				<td>{row.player}</td>
				<td>{row.court}</td>
				<td>{#if onDelete}<DeleteIcon onClick={onDelete} />{/if}</td>
			</tr>
		{/each}
	</tbody>
</table>
