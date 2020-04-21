var app = (function () {
	'use strict';

	function noop() {}

	function add_location(element, file, line, column, char) {
		element.__svelte_meta = {
			loc: { file, line, column, char }
		};
	}

	function run(fn) {
		return fn();
	}

	function blank_object() {
		return Object.create(null);
	}

	function run_all(fns) {
		fns.forEach(run);
	}

	function is_function(thing) {
		return typeof thing === 'function';
	}

	function safe_not_equal(a, b) {
		return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
	}

	function append(target, node) {
		target.appendChild(node);
	}

	function insert(target, node, anchor) {
		target.insertBefore(node, anchor);
	}

	function detach(node) {
		node.parentNode.removeChild(node);
	}

	function destroy_each(iterations, detaching) {
		for (let i = 0; i < iterations.length; i += 1) {
			if (iterations[i]) iterations[i].d(detaching);
		}
	}

	function element(name) {
		return document.createElement(name);
	}

	function text(data) {
		return document.createTextNode(data);
	}

	function space() {
		return text(' ');
	}

	function listen(node, event, handler, options) {
		node.addEventListener(event, handler, options);
		return () => node.removeEventListener(event, handler, options);
	}

	function attr(node, attribute, value) {
		if (value == null) node.removeAttribute(attribute);
		else node.setAttribute(attribute, value);
	}

	function children(element) {
		return Array.from(element.childNodes);
	}

	function set_data(text, data) {
		data = '' + data;
		if (text.data !== data) text.data = data;
	}

	let current_component;

	function set_current_component(component) {
		current_component = component;
	}

	const dirty_components = [];

	const resolved_promise = Promise.resolve();
	let update_scheduled = false;
	const binding_callbacks = [];
	const render_callbacks = [];
	const flush_callbacks = [];

	function schedule_update() {
		if (!update_scheduled) {
			update_scheduled = true;
			resolved_promise.then(flush);
		}
	}

	function add_render_callback(fn) {
		render_callbacks.push(fn);
	}

	function flush() {
		const seen_callbacks = new Set();

		do {
			// first, call beforeUpdate functions
			// and update components
			while (dirty_components.length) {
				const component = dirty_components.shift();
				set_current_component(component);
				update(component.$$);
			}

			while (binding_callbacks.length) binding_callbacks.shift()();

			// then, once components are updated, call
			// afterUpdate functions. This may cause
			// subsequent updates...
			while (render_callbacks.length) {
				const callback = render_callbacks.pop();
				if (!seen_callbacks.has(callback)) {
					callback();

					// ...so guard against infinite loops
					seen_callbacks.add(callback);
				}
			}
		} while (dirty_components.length);

		while (flush_callbacks.length) {
			flush_callbacks.pop()();
		}

		update_scheduled = false;
	}

	function update($$) {
		if ($$.fragment) {
			$$.update($$.dirty);
			run_all($$.before_render);
			$$.fragment.p($$.dirty, $$.ctx);
			$$.dirty = null;

			$$.after_render.forEach(add_render_callback);
		}
	}

	let outros;

	function group_outros() {
		outros = {
			remaining: 0,
			callbacks: []
		};
	}

	function check_outros() {
		if (!outros.remaining) {
			run_all(outros.callbacks);
		}
	}

	function on_outro(callback) {
		outros.callbacks.push(callback);
	}

	function mount_component(component, target, anchor) {
		const { fragment, on_mount, on_destroy, after_render } = component.$$;

		fragment.m(target, anchor);

		// onMount happens after the initial afterUpdate. Because
		// afterUpdate callbacks happen in reverse order (inner first)
		// we schedule onMount callbacks before afterUpdate callbacks
		add_render_callback(() => {
			const new_on_destroy = on_mount.map(run).filter(is_function);
			if (on_destroy) {
				on_destroy.push(...new_on_destroy);
			} else {
				// Edge case - component was destroyed immediately,
				// most likely as a result of a binding initialising
				run_all(new_on_destroy);
			}
			component.$$.on_mount = [];
		});

		after_render.forEach(add_render_callback);
	}

	function destroy(component, detaching) {
		if (component.$$) {
			run_all(component.$$.on_destroy);
			component.$$.fragment.d(detaching);

			// TODO null out other refs, including component.$$ (but need to
			// preserve final state?)
			component.$$.on_destroy = component.$$.fragment = null;
			component.$$.ctx = {};
		}
	}

	function make_dirty(component, key) {
		if (!component.$$.dirty) {
			dirty_components.push(component);
			schedule_update();
			component.$$.dirty = {};
		}
		component.$$.dirty[key] = true;
	}

	function init(component, options, instance, create_fragment, not_equal$$1, prop_names) {
		const parent_component = current_component;
		set_current_component(component);

		const props = options.props || {};

		const $$ = component.$$ = {
			fragment: null,
			ctx: null,

			// state
			props: prop_names,
			update: noop,
			not_equal: not_equal$$1,
			bound: blank_object(),

			// lifecycle
			on_mount: [],
			on_destroy: [],
			before_render: [],
			after_render: [],
			context: new Map(parent_component ? parent_component.$$.context : []),

			// everything else
			callbacks: blank_object(),
			dirty: null
		};

		let ready = false;

		$$.ctx = instance
			? instance(component, props, (key, value) => {
				if ($$.ctx && not_equal$$1($$.ctx[key], $$.ctx[key] = value)) {
					if ($$.bound[key]) $$.bound[key](value);
					if (ready) make_dirty(component, key);
				}
			})
			: props;

		$$.update();
		ready = true;
		run_all($$.before_render);
		$$.fragment = create_fragment($$.ctx);

		if (options.target) {
			if (options.hydrate) {
				$$.fragment.l(children(options.target));
			} else {
				$$.fragment.c();
			}

			if (options.intro && component.$$.fragment.i) component.$$.fragment.i();
			mount_component(component, options.target, options.anchor);
			flush();
		}

		set_current_component(parent_component);
	}

	class SvelteComponent {
		$destroy() {
			destroy(this, true);
			this.$destroy = noop;
		}

		$on(type, callback) {
			const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
			callbacks.push(callback);

			return () => {
				const index = callbacks.indexOf(callback);
				if (index !== -1) callbacks.splice(index, 1);
			};
		}

		$set() {
			// overridden by instance, if it has props
		}
	}

	class SvelteComponentDev extends SvelteComponent {
		constructor(options) {
			if (!options || (!options.target && !options.$$inline)) {
				throw new Error(`'target' is a required option`);
			}

			super();
		}

		$destroy() {
			super.$destroy();
			this.$destroy = () => {
				console.warn(`Component was already destroyed`); // eslint-disable-line no-console
			};
		}
	}

	/* src/Icon.svelte generated by Svelte v3.1.0 */

	const file = "src/Icon.svelte";

	function create_fragment(ctx) {
		var button, img, img_src_value, dispose;

		return {
			c: function create() {
				button = element("button");
				img = element("img");
				img.alt = ctx.alt;
				img.src = img_src_value = "https://baanreserveren.nl/images/icons/" + ctx.icon + ".png";
				img.className = "svelte-jc3zyx";
				add_location(img, file, 18, 1, 232);
				button.className = "icon svelte-jc3zyx";
				add_location(button, file, 17, 0, 190);
				dispose = listen(button, "click", ctx.onClick);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, button, anchor);
				append(button, img);
			},

			p: function update(changed, ctx) {
				if (changed.alt) {
					img.alt = ctx.alt;
				}

				if ((changed.icon) && img_src_value !== (img_src_value = "https://baanreserveren.nl/images/icons/" + ctx.icon + ".png")) {
					img.src = img_src_value;
				}
			},

			i: noop,
			o: noop,

			d: function destroy(detaching) {
				if (detaching) {
					detach(button);
				}

				dispose();
			}
		};
	}

	function instance($$self, $$props, $$invalidate) {
		let { alt, icon, onClick } = $$props;

		$$self.$set = $$props => {
			if ('alt' in $$props) $$invalidate('alt', alt = $$props.alt);
			if ('icon' in $$props) $$invalidate('icon', icon = $$props.icon);
			if ('onClick' in $$props) $$invalidate('onClick', onClick = $$props.onClick);
		};

		return { alt, icon, onClick };
	}

	class Icon extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance, create_fragment, safe_not_equal, ["alt", "icon", "onClick"]);

			const { ctx } = this.$$;
			const props = options.props || {};
			if (ctx.alt === undefined && !('alt' in props)) {
				console.warn("<Icon> was created without expected prop 'alt'");
			}
			if (ctx.icon === undefined && !('icon' in props)) {
				console.warn("<Icon> was created without expected prop 'icon'");
			}
			if (ctx.onClick === undefined && !('onClick' in props)) {
				console.warn("<Icon> was created without expected prop 'onClick'");
			}
		}

		get alt() {
			throw new Error("<Icon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set alt(value) {
			throw new Error("<Icon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		get icon() {
			throw new Error("<Icon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set icon(value) {
			throw new Error("<Icon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		get onClick() {
			throw new Error("<Icon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set onClick(value) {
			throw new Error("<Icon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}
	}

	/* src/DeleteIcon.svelte generated by Svelte v3.1.0 */

	function create_fragment$1(ctx) {
		var current;

		var icon = new Icon({
			props: {
			alt: "DELETE",
			icon: "delete",
			onClick: ctx.onClick
		},
			$$inline: true
		});

		return {
			c: function create() {
				icon.$$.fragment.c();
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				mount_component(icon, target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				var icon_changes = {};
				if (changed.onClick) icon_changes.onClick = ctx.onClick;
				icon.$set(icon_changes);
			},

			i: function intro(local) {
				if (current) return;
				icon.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				icon.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				icon.$destroy(detaching);
			}
		};
	}

	function instance$1($$self, $$props, $$invalidate) {
		let { onClick } = $$props;

		$$self.$set = $$props => {
			if ('onClick' in $$props) $$invalidate('onClick', onClick = $$props.onClick);
		};

		return { onClick };
	}

	class DeleteIcon extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$1, create_fragment$1, safe_not_equal, ["onClick"]);

			const { ctx } = this.$$;
			const props = options.props || {};
			if (ctx.onClick === undefined && !('onClick' in props)) {
				console.warn("<DeleteIcon> was created without expected prop 'onClick'");
			}
		}

		get onClick() {
			throw new Error("<DeleteIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set onClick(value) {
			throw new Error("<DeleteIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}
	}

	/* src/AddIcon.svelte generated by Svelte v3.1.0 */

	function create_fragment$2(ctx) {
		var current;

		var icon = new Icon({
			props: {
			alt: "ADD",
			icon: "add",
			onClick: ctx.onClick
		},
			$$inline: true
		});

		return {
			c: function create() {
				icon.$$.fragment.c();
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				mount_component(icon, target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				var icon_changes = {};
				if (changed.onClick) icon_changes.onClick = ctx.onClick;
				icon.$set(icon_changes);
			},

			i: function intro(local) {
				if (current) return;
				icon.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				icon.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				icon.$destroy(detaching);
			}
		};
	}

	function instance$2($$self, $$props, $$invalidate) {
		let { onClick } = $$props;

		$$self.$set = $$props => {
			if ('onClick' in $$props) $$invalidate('onClick', onClick = $$props.onClick);
		};

		return { onClick };
	}

	class AddIcon extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$2, create_fragment$2, safe_not_equal, ["onClick"]);

			const { ctx } = this.$$;
			const props = options.props || {};
			if (ctx.onClick === undefined && !('onClick' in props)) {
				console.warn("<AddIcon> was created without expected prop 'onClick'");
			}
		}

		get onClick() {
			throw new Error("<AddIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set onClick(value) {
			throw new Error("<AddIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}
	}

	/* src/BlockedCourtsTable.svelte generated by Svelte v3.1.0 */

	const file$1 = "src/BlockedCourtsTable.svelte";

	function get_each_context(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.row = list[i];
		return child_ctx;
	}

	// (21:8) {#if onDelete}
	function create_if_block(ctx) {
		var current;

		var deleteicon = new DeleteIcon({
			props: { onClick: ctx.onDelete },
			$$inline: true
		});

		return {
			c: function create() {
				deleteicon.$$.fragment.c();
			},

			m: function mount(target, anchor) {
				mount_component(deleteicon, target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				var deleteicon_changes = {};
				if (changed.onDelete) deleteicon_changes.onClick = ctx.onDelete;
				deleteicon.$set(deleteicon_changes);
			},

			i: function intro(local) {
				if (current) return;
				deleteicon.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				deleteicon.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				deleteicon.$destroy(detaching);
			}
		};
	}

	// (17:2) {#each rows as row}
	function create_each_block(ctx) {
		var tr, td0, t0_value = ctx.row.id, t0, t1, td1, t2_value = ctx.row.court, t2, t3, td2, t4, tr_data_id_value, current;

		var if_block = (ctx.onDelete) && create_if_block(ctx);

		return {
			c: function create() {
				tr = element("tr");
				td0 = element("td");
				t0 = text(t0_value);
				t1 = space();
				td1 = element("td");
				t2 = text(t2_value);
				t3 = space();
				td2 = element("td");
				if (if_block) if_block.c();
				t4 = space();
				add_location(td0, file$1, 18, 4, 363);
				add_location(td1, file$1, 19, 4, 385);
				add_location(td2, file$1, 20, 4, 410);
				tr.dataset.id = tr_data_id_value = ctx.row.id;
				add_location(tr, file$1, 17, 3, 335);
			},

			m: function mount(target, anchor) {
				insert(target, tr, anchor);
				append(tr, td0);
				append(td0, t0);
				append(tr, t1);
				append(tr, td1);
				append(td1, t2);
				append(tr, t3);
				append(tr, td2);
				if (if_block) if_block.m(td2, null);
				append(tr, t4);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((!current || changed.rows) && t0_value !== (t0_value = ctx.row.id)) {
					set_data(t0, t0_value);
				}

				if ((!current || changed.rows) && t2_value !== (t2_value = ctx.row.court)) {
					set_data(t2, t2_value);
				}

				if (ctx.onDelete) {
					if (if_block) {
						if_block.p(changed, ctx);
						if_block.i(1);
					} else {
						if_block = create_if_block(ctx);
						if_block.c();
						if_block.i(1);
						if_block.m(td2, null);
					}
				} else if (if_block) {
					group_outros();
					on_outro(() => {
						if_block.d(1);
						if_block = null;
					});

					if_block.o(1);
					check_outros();
				}

				if ((!current || changed.rows) && tr_data_id_value !== (tr_data_id_value = ctx.row.id)) {
					tr.dataset.id = tr_data_id_value;
				}
			},

			i: function intro(local) {
				if (current) return;
				if (if_block) if_block.i();
				current = true;
			},

			o: function outro(local) {
				if (if_block) if_block.o();
				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(tr);
				}

				if (if_block) if_block.d();
			}
		};
	}

	function create_fragment$3(ctx) {
		var table, thead, tr, th0, t1, th1, t3, th2, t4, tbody, current;

		var addicon = new AddIcon({
			props: { onClick: ctx.onAdd },
			$$inline: true
		});

		var each_value = ctx.rows;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
		}

		function outro_block(i, detaching, local) {
			if (each_blocks[i]) {
				if (detaching) {
					on_outro(() => {
						each_blocks[i].d(detaching);
						each_blocks[i] = null;
					});
				}

				each_blocks[i].o(local);
			}
		}

		return {
			c: function create() {
				table = element("table");
				thead = element("thead");
				tr = element("tr");
				th0 = element("th");
				th0.textContent = "ID";
				t1 = space();
				th1 = element("th");
				th1.textContent = "Court";
				t3 = space();
				th2 = element("th");
				addicon.$$.fragment.c();
				t4 = space();
				tbody = element("tbody");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				add_location(th0, file$1, 10, 3, 213);
				add_location(th1, file$1, 11, 3, 228);
				add_location(th2, file$1, 12, 3, 246);
				add_location(tr, file$1, 9, 2, 205);
				add_location(thead, file$1, 8, 1, 195);
				add_location(tbody, file$1, 15, 1, 302);
				table.border = "1";
				attr(table, "cellspacing", "0");
				attr(table, "cellpadding", "10");
				add_location(table, file$1, 7, 0, 148);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, table, anchor);
				append(table, thead);
				append(thead, tr);
				append(tr, th0);
				append(tr, t1);
				append(tr, th1);
				append(tr, t3);
				append(tr, th2);
				mount_component(addicon, th2, null);
				append(table, t4);
				append(table, tbody);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(tbody, null);
				}

				current = true;
			},

			p: function update(changed, ctx) {
				var addicon_changes = {};
				if (changed.onAdd) addicon_changes.onClick = ctx.onAdd;
				addicon.$set(addicon_changes);

				if (changed.rows || changed.onDelete) {
					each_value = ctx.rows;

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
							each_blocks[i].i(1);
						} else {
							each_blocks[i] = create_each_block(child_ctx);
							each_blocks[i].c();
							each_blocks[i].i(1);
							each_blocks[i].m(tbody, null);
						}
					}

					group_outros();
					for (; i < each_blocks.length; i += 1) outro_block(i, 1, 1);
					check_outros();
				}
			},

			i: function intro(local) {
				if (current) return;
				addicon.$$.fragment.i(local);

				for (var i = 0; i < each_value.length; i += 1) each_blocks[i].i();

				current = true;
			},

			o: function outro(local) {
				addicon.$$.fragment.o(local);

				each_blocks = each_blocks.filter(Boolean);
				for (let i = 0; i < each_blocks.length; i += 1) outro_block(i, 0);

				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(table);
				}

				addicon.$destroy();

				destroy_each(each_blocks, detaching);
			}
		};
	}

	function instance$3($$self, $$props, $$invalidate) {
		

	let { rows, onAdd, onDelete = null } = $$props;

		$$self.$set = $$props => {
			if ('rows' in $$props) $$invalidate('rows', rows = $$props.rows);
			if ('onAdd' in $$props) $$invalidate('onAdd', onAdd = $$props.onAdd);
			if ('onDelete' in $$props) $$invalidate('onDelete', onDelete = $$props.onDelete);
		};

		return { rows, onAdd, onDelete };
	}

	class BlockedCourtsTable extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$3, create_fragment$3, safe_not_equal, ["rows", "onAdd", "onDelete"]);

			const { ctx } = this.$$;
			const props = options.props || {};
			if (ctx.rows === undefined && !('rows' in props)) {
				console.warn("<BlockedCourtsTable> was created without expected prop 'rows'");
			}
			if (ctx.onAdd === undefined && !('onAdd' in props)) {
				console.warn("<BlockedCourtsTable> was created without expected prop 'onAdd'");
			}
			if (ctx.onDelete === undefined && !('onDelete' in props)) {
				console.warn("<BlockedCourtsTable> was created without expected prop 'onDelete'");
			}
		}

		get rows() {
			throw new Error("<BlockedCourtsTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set rows(value) {
			throw new Error("<BlockedCourtsTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		get onAdd() {
			throw new Error("<BlockedCourtsTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set onAdd(value) {
			throw new Error("<BlockedCourtsTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		get onDelete() {
			throw new Error("<BlockedCourtsTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set onDelete(value) {
			throw new Error("<BlockedCourtsTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}
	}

	/* src/BlockReservationsTable.svelte generated by Svelte v3.1.0 */

	const file$2 = "src/BlockReservationsTable.svelte";

	function get_each_context$1(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.row = list[i];
		return child_ctx;
	}

	// (23:8) {#if onDelete}
	function create_if_block$1(ctx) {
		var current;

		var deleteicon = new DeleteIcon({
			props: { onClick: ctx.onDelete },
			$$inline: true
		});

		return {
			c: function create() {
				deleteicon.$$.fragment.c();
			},

			m: function mount(target, anchor) {
				mount_component(deleteicon, target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				var deleteicon_changes = {};
				if (changed.onDelete) deleteicon_changes.onClick = ctx.onDelete;
				deleteicon.$set(deleteicon_changes);
			},

			i: function intro(local) {
				if (current) return;
				deleteicon.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				deleteicon.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				deleteicon.$destroy(detaching);
			}
		};
	}

	// (18:2) {#each rows as row}
	function create_each_block$1(ctx) {
		var tr, td0, t0_value = ctx.row.id, t0, t1, td1, t2_value = ctx.row.player, t2, t3, td2, t4_value = ctx.row.court, t4, t5, td3, t6, tr_data_id_value, current;

		var if_block = (ctx.onDelete) && create_if_block$1(ctx);

		return {
			c: function create() {
				tr = element("tr");
				td0 = element("td");
				t0 = text(t0_value);
				t1 = space();
				td1 = element("td");
				t2 = text(t2_value);
				t3 = space();
				td2 = element("td");
				t4 = text(t4_value);
				t5 = space();
				td3 = element("td");
				if (if_block) if_block.c();
				t6 = space();
				add_location(td0, file$2, 19, 4, 382);
				add_location(td1, file$2, 20, 4, 404);
				add_location(td2, file$2, 21, 4, 430);
				add_location(td3, file$2, 22, 4, 455);
				tr.dataset.id = tr_data_id_value = ctx.row.id;
				add_location(tr, file$2, 18, 3, 354);
			},

			m: function mount(target, anchor) {
				insert(target, tr, anchor);
				append(tr, td0);
				append(td0, t0);
				append(tr, t1);
				append(tr, td1);
				append(td1, t2);
				append(tr, t3);
				append(tr, td2);
				append(td2, t4);
				append(tr, t5);
				append(tr, td3);
				if (if_block) if_block.m(td3, null);
				append(tr, t6);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((!current || changed.rows) && t0_value !== (t0_value = ctx.row.id)) {
					set_data(t0, t0_value);
				}

				if ((!current || changed.rows) && t2_value !== (t2_value = ctx.row.player)) {
					set_data(t2, t2_value);
				}

				if ((!current || changed.rows) && t4_value !== (t4_value = ctx.row.court)) {
					set_data(t4, t4_value);
				}

				if (ctx.onDelete) {
					if (if_block) {
						if_block.p(changed, ctx);
						if_block.i(1);
					} else {
						if_block = create_if_block$1(ctx);
						if_block.c();
						if_block.i(1);
						if_block.m(td3, null);
					}
				} else if (if_block) {
					group_outros();
					on_outro(() => {
						if_block.d(1);
						if_block = null;
					});

					if_block.o(1);
					check_outros();
				}

				if ((!current || changed.rows) && tr_data_id_value !== (tr_data_id_value = ctx.row.id)) {
					tr.dataset.id = tr_data_id_value;
				}
			},

			i: function intro(local) {
				if (current) return;
				if (if_block) if_block.i();
				current = true;
			},

			o: function outro(local) {
				if (if_block) if_block.o();
				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(tr);
				}

				if (if_block) if_block.d();
			}
		};
	}

	function create_fragment$4(ctx) {
		var table, thead, tr, th0, t1, th1, t3, th2, t5, th3, t6, tbody, current;

		var addicon = new AddIcon({
			props: { onClick: ctx.onAdd },
			$$inline: true
		});

		var each_value = ctx.rows;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
		}

		function outro_block(i, detaching, local) {
			if (each_blocks[i]) {
				if (detaching) {
					on_outro(() => {
						each_blocks[i].d(detaching);
						each_blocks[i] = null;
					});
				}

				each_blocks[i].o(local);
			}
		}

		return {
			c: function create() {
				table = element("table");
				thead = element("thead");
				tr = element("tr");
				th0 = element("th");
				th0.textContent = "ID";
				t1 = space();
				th1 = element("th");
				th1.textContent = "Player";
				t3 = space();
				th2 = element("th");
				th2.textContent = "Court";
				t5 = space();
				th3 = element("th");
				addicon.$$.fragment.c();
				t6 = space();
				tbody = element("tbody");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}
				add_location(th0, file$2, 10, 3, 213);
				add_location(th1, file$2, 11, 3, 228);
				add_location(th2, file$2, 12, 3, 247);
				add_location(th3, file$2, 13, 3, 265);
				add_location(tr, file$2, 9, 2, 205);
				add_location(thead, file$2, 8, 1, 195);
				add_location(tbody, file$2, 16, 1, 321);
				table.border = "1";
				attr(table, "cellspacing", "0");
				attr(table, "cellpadding", "10");
				add_location(table, file$2, 7, 0, 148);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, table, anchor);
				append(table, thead);
				append(thead, tr);
				append(tr, th0);
				append(tr, t1);
				append(tr, th1);
				append(tr, t3);
				append(tr, th2);
				append(tr, t5);
				append(tr, th3);
				mount_component(addicon, th3, null);
				append(table, t6);
				append(table, tbody);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(tbody, null);
				}

				current = true;
			},

			p: function update(changed, ctx) {
				var addicon_changes = {};
				if (changed.onAdd) addicon_changes.onClick = ctx.onAdd;
				addicon.$set(addicon_changes);

				if (changed.rows || changed.onDelete) {
					each_value = ctx.rows;

					for (var i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$1(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
							each_blocks[i].i(1);
						} else {
							each_blocks[i] = create_each_block$1(child_ctx);
							each_blocks[i].c();
							each_blocks[i].i(1);
							each_blocks[i].m(tbody, null);
						}
					}

					group_outros();
					for (; i < each_blocks.length; i += 1) outro_block(i, 1, 1);
					check_outros();
				}
			},

			i: function intro(local) {
				if (current) return;
				addicon.$$.fragment.i(local);

				for (var i = 0; i < each_value.length; i += 1) each_blocks[i].i();

				current = true;
			},

			o: function outro(local) {
				addicon.$$.fragment.o(local);

				each_blocks = each_blocks.filter(Boolean);
				for (let i = 0; i < each_blocks.length; i += 1) outro_block(i, 0);

				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(table);
				}

				addicon.$destroy();

				destroy_each(each_blocks, detaching);
			}
		};
	}

	function instance$4($$self, $$props, $$invalidate) {
		

	let { rows, onAdd, onDelete = null } = $$props;

		$$self.$set = $$props => {
			if ('rows' in $$props) $$invalidate('rows', rows = $$props.rows);
			if ('onAdd' in $$props) $$invalidate('onAdd', onAdd = $$props.onAdd);
			if ('onDelete' in $$props) $$invalidate('onDelete', onDelete = $$props.onDelete);
		};

		return { rows, onAdd, onDelete };
	}

	class BlockReservationsTable extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$4, create_fragment$4, safe_not_equal, ["rows", "onAdd", "onDelete"]);

			const { ctx } = this.$$;
			const props = options.props || {};
			if (ctx.rows === undefined && !('rows' in props)) {
				console.warn("<BlockReservationsTable> was created without expected prop 'rows'");
			}
			if (ctx.onAdd === undefined && !('onAdd' in props)) {
				console.warn("<BlockReservationsTable> was created without expected prop 'onAdd'");
			}
			if (ctx.onDelete === undefined && !('onDelete' in props)) {
				console.warn("<BlockReservationsTable> was created without expected prop 'onDelete'");
			}
		}

		get rows() {
			throw new Error("<BlockReservationsTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set rows(value) {
			throw new Error("<BlockReservationsTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		get onAdd() {
			throw new Error("<BlockReservationsTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set onAdd(value) {
			throw new Error("<BlockReservationsTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		get onDelete() {
			throw new Error("<BlockReservationsTable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set onDelete(value) {
			throw new Error("<BlockReservationsTable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}
	}

	/* src/App.svelte generated by Svelte v3.1.0 */

	const file$3 = "src/App.svelte";

	function create_fragment$5(ctx) {
		var h1, t0, t1_value = ctx.blockedCourts.length + ctx.blockReservations.length, t1, t2, t3, h20, t4, t5_value = ctx.blockedCourts.length, t5, t6, t7, t8, h21, t9, t10_value = ctx.blockReservations.length, t10, t11, t12, current;

		var blockedcourtstable = new BlockedCourtsTable({
			props: {
			rows: ctx.blockedCourts,
			onAdd: ctx.bcAdd,
			onDelete: ctx.bcDelete
		},
			$$inline: true
		});

		var blockreservationstable = new BlockReservationsTable({
			props: {
			rows: ctx.blockReservations,
			onAdd: ctx.brAdd,
			onDelete: ctx.brDelete
		},
			$$inline: true
		});

		return {
			c: function create() {
				h1 = element("h1");
				t0 = text("BR records (");
				t1 = text(t1_value);
				t2 = text(")");
				t3 = space();
				h20 = element("h2");
				t4 = text("Blocked courts (");
				t5 = text(t5_value);
				t6 = text(")");
				t7 = space();
				blockedcourtstable.$$.fragment.c();
				t8 = space();
				h21 = element("h2");
				t9 = text("Block reservations (");
				t10 = text(t10_value);
				t11 = text(")");
				t12 = space();
				blockreservationstable.$$.fragment.c();
				add_location(h1, file$3, 47, 0, 1476);
				add_location(h20, file$3, 49, 0, 1549);
				add_location(h21, file$3, 53, 0, 1678);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, h1, anchor);
				append(h1, t0);
				append(h1, t1);
				append(h1, t2);
				insert(target, t3, anchor);
				insert(target, h20, anchor);
				append(h20, t4);
				append(h20, t5);
				append(h20, t6);
				insert(target, t7, anchor);
				mount_component(blockedcourtstable, target, anchor);
				insert(target, t8, anchor);
				insert(target, h21, anchor);
				append(h21, t9);
				append(h21, t10);
				append(h21, t11);
				insert(target, t12, anchor);
				mount_component(blockreservationstable, target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((!current || changed.blockedCourts || changed.blockReservations) && t1_value !== (t1_value = ctx.blockedCourts.length + ctx.blockReservations.length)) {
					set_data(t1, t1_value);
				}

				if ((!current || changed.blockedCourts) && t5_value !== (t5_value = ctx.blockedCourts.length)) {
					set_data(t5, t5_value);
				}

				var blockedcourtstable_changes = {};
				if (changed.blockedCourts) blockedcourtstable_changes.rows = ctx.blockedCourts;
				if (changed.bcAdd) blockedcourtstable_changes.onAdd = ctx.bcAdd;
				if (changed.bcDelete) blockedcourtstable_changes.onDelete = ctx.bcDelete;
				blockedcourtstable.$set(blockedcourtstable_changes);

				if ((!current || changed.blockReservations) && t10_value !== (t10_value = ctx.blockReservations.length)) {
					set_data(t10, t10_value);
				}

				var blockreservationstable_changes = {};
				if (changed.blockReservations) blockreservationstable_changes.rows = ctx.blockReservations;
				if (changed.brAdd) blockreservationstable_changes.onAdd = ctx.brAdd;
				if (changed.brDelete) blockreservationstable_changes.onDelete = ctx.brDelete;
				blockreservationstable.$set(blockreservationstable_changes);
			},

			i: function intro(local) {
				if (current) return;
				blockedcourtstable.$$.fragment.i(local);

				blockreservationstable.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				blockedcourtstable.$$.fragment.o(local);
				blockreservationstable.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(h1);
					detach(t3);
					detach(h20);
					detach(t7);
				}

				blockedcourtstable.$destroy(detaching);

				if (detaching) {
					detach(t8);
					detach(h21);
					detach(t12);
				}

				blockreservationstable.$destroy(detaching);
			}
		};
	}

	function instance$5($$self, $$props, $$invalidate) {
		

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
		$$invalidate('blockedCourts', blockedCourts = [...blockedCourts, {id: id(), court: court()}]);
		// console.log('blockedCourts', blockedCourts);
	};
	const bcDelete = function(e) {
		const id = this.closest('tr').dataset.id;
		$$invalidate('blockedCourts', blockedCourts = blockedCourts.filter(obj => obj.id != id));
	};

	const brAdd = e => {
		$$invalidate('blockReservations', blockReservations = [...blockReservations, {id: id(), court: court(), player: player()}]);
		// console.log('blockReservations', blockReservations);
	};
	const brDelete = function(e) {
		const id = this.closest('tr').dataset.id;
		if (confirm(`Do you really really want to delete row # ${id}?`)) {
			$$invalidate('blockReservations', blockReservations = blockReservations.filter(obj => obj.id != id));
		}
	};

		return {
			blockedCourts,
			blockReservations,
			bcAdd,
			bcDelete,
			brAdd,
			brDelete
		};
	}

	class App extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$5, create_fragment$5, safe_not_equal, []);
		}
	}

	var app = new App({
		target: document.body
	});

	return app;

}());
