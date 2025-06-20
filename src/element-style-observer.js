import bugs from "./util/bugs/index.js";
import gentleRegisterProperty from "./util/gentle-register-property.js";
import MultiWeakMap from "./util/MultiWeakMap.js";
import { toArray, wait, getTimesFor } from "./util.js";
import RenderedObserver from "./rendered-observer.js";

const allowDiscrete = globalThis.CSS?.supports?.("transition-behavior", "allow-discrete")
	? " allow-discrete"
	: "";

if (globalThis.document) {
	gentleRegisterProperty("--style-observer-transition", { inherits: false });
	bugs.detectAll();
}

/**
 * @typedef { object } StyleObserverOptionsObject
 * @property { string[] } properties - The properties to observe.
 */
/**
 * @typedef { StyleObserverOptionsObject | string | string[] } StyleObserverOptions
 */

/**
 * @callback StyleObserverCallback
 * @param {Record[]} records
 * @returns {void}
 */

/**
 * @typedef { Object } Record
 * @property {Element} target - The element that changed.
 * @property {string} property - The property that changed.
 * @property {string} value - The new value of the property.
 * @property {string} oldValue - The old value of the property.
 */

export default class ElementStyleObserver {
	/**
	 * Observed properties to their old values.
	 * @type {Map<string, string>}
	 */
	properties;

	/**
	 * Get the names of all properties currently being observed.
	 * @type { string[] }
	 */
	get propertyNames () {
		return [...this.properties.keys()];
	}

	/**
	 * The element being observed.
	 * @type {Element}
	 */
	target;

	/**
	 * The callback to call when the element's style changes.
	 * @type {StyleObserverCallback}
	 */
	callback;

	/**
	 * The observer options.
	 * @type {StyleObserverOptions}
	 */
	options;

	/**
	 * Whether the observer has been initialized.
	 * @type {boolean}
	 */
	#initialized = false;

	/**
	 * @param {Element} target
	 * @param {StyleObserverCallback} callback
	 * @param {StyleObserverOptions} [options]
	 */
	constructor (target, callback, options = {}) {
		this.constructor.all.add(target, this);
		this.properties = new Map();
		this.target = target;
		this.callback = callback;
		this.options = { properties: [], ...options };
		let properties = toArray(options.properties);

		this.renderedObserver = new RenderedObserver(records => {
			if (this.propertyNames.length > 0) {
				this.handleEvent();
			}
		});

		if (properties.length > 0) {
			this.observe(properties);
		}
	}

	/**
	 * Called the first time observe() is called to initialize the target.
	 */
	#init () {
		if (this.#initialized) {
			return;
		}

		let firstTime = this.constructor.all.get(this.target).size === 1;
		this.updateTransition({ firstTime });

		this.#initialized = true;
	}

	resolveOptions (options) {
		return Object.assign(resolveOptions(options), this.options);
	}

	/**
	 * Handle a potential property change
	 * @private
	 * @param {TransitionEvent} [event]
	 */
	async handleEvent (event) {
		if (event && !this.properties.has(event.propertyName)) {
			return;
		}

		if (
			(bugs.TRANSITIONRUN_EVENT_LOOP && event?.type === "transitionrun") ||
			this.options.throttle > 0
		) {
			let eventName = bugs.TRANSITIONRUN_EVENT_LOOP ? "transitionrun" : "transitionstart";
			let delay = Math.max(this.options.throttle, 50);

			if (bugs.TRANSITIONRUN_EVENT_LOOP) {
				// Safari < 18.2 fires `transitionrun` events too often, so we need to debounce.
				// Wait at least the amount of time needed for the transition to run + 1 frame (~16ms)
				let times = getTimesFor(
					event.propertyName,
					getComputedStyle(this.target).transition,
				);
				delay = Math.max(delay, times.duration + times.delay + 16);
			}

			this.target.removeEventListener(eventName, this);
			await wait(delay);
			this.target.addEventListener(eventName, this);
		}

		let cs = getComputedStyle(this.target);
		let records = [];

		// Other properties may have changed in the meantime
		for (let property of this.propertyNames) {
			let value = cs.getPropertyValue(property);
			let oldValue = this.properties.get(property);

			if (value !== oldValue) {
				records.push({ target: this.target, property, value, oldValue });
				this.properties.set(property, value);
			}
		}

		if (records.length > 0) {
			this.callback(records);
		}
	}

	/**
	 * Observe the target for changes to one or more CSS properties.
	 * @param {string | string[]} properties
	 * @return {void}
	 */
	observe (properties) {
		properties = toArray(properties);

		// Drop properties already being observed
		properties = properties.filter(property => !this.properties.has(property));

		if (properties.length === 0) {
			// Nothing new to observe
			return;
		}

		this.#init();

		let cs = getComputedStyle(this.target);

		for (let property of properties) {
			if (bugs.UNREGISTERED_TRANSITION && !this.constructor.properties.has(property)) {
				// Init property
				gentleRegisterProperty(property, undefined, this.target.ownerDocument);
				this.constructor.properties.add(property);
			}

			let value = cs.getPropertyValue(property);
			this.properties.set(property, value);
		}

		if (bugs.TRANSITIONRUN_EVENT_LOOP) {
			// In the browsers affected by the bug, `transitionstart` events might not be fired at all,
			// so we need to listen for `transitionrun` events instead.
			// See https://github.com/LeaVerou/style-observer/issues/42
			this.target.addEventListener("transitionrun", this);

			bugs.all.TRANSITIONRUN_EVENT_LOOP.valuePending?.then(affected => {
				if (!affected) {
					// The bug is not present, we can remove the listener
					this.target.removeEventListener("transitionrun", this);
				}
			});
		}

		this.target.addEventListener("transitionstart", this);
		this.target.addEventListener("transitionend", this);
		this.updateTransitionProperties();

		this.renderedObserver.observe(this.target);
	}

	/**
	 * Update the `--style-observer-transition` property to include all observed properties.
	 */
	updateTransitionProperties () {
		// Clear our own transition
		this.setProperty("--style-observer-transition", "");

		let transitionProperties = new Set(
			getComputedStyle(this.target).transitionProperty.split(", "),
		);
		let properties = [];

		for (let observer of this.constructor.all.get(this.target)) {
			properties.push(...observer.propertyNames);
		}

		properties = [...new Set(properties)]; // Dedupe

		// Only add properties not already present
		let transition = properties
			.filter(property => !transitionProperties.has(property))
			.map(property => `${property} 1ms step-start${allowDiscrete}`)
			.join(", ");

		this.setProperty("--style-observer-transition", transition);
	}

	/**
	 * @type { string | undefined }
	 */
	#inlineTransition;

	/**
	 * Update the target's transition property or refresh it if it was overwritten.
	 * @param {object} options
	 * @param {boolean} [options.firstTime] - Whether this is the first time the transition is being set.
	 */
	updateTransition ({ firstTime } = {}) {
		const sot = "var(--style-observer-transition, --style-observer-noop)";
		const inlineTransition = this.getProperty("transition");
		let transition;

		// NOTE This code assumes that if there is an inline style, it takes precedence over other styles
		// This is not always true (think of !important), but will do for now.
		if (firstTime ? inlineTransition : !inlineTransition.includes(sot)) {
			// Either we are starting with an inline style being there, or our inline style was overwritten
			transition = this.#inlineTransition = inlineTransition;
		}

		if (transition === undefined && (firstTime || !this.#inlineTransition)) {
			// Just update based on most current computed style
			if (inlineTransition.includes(sot)) {
				this.setProperty("transition", "");
			}

			transition = getComputedStyle(this.target).transition;
		}

		if (transition === "all") {
			transition = "";
		}
		else {
			// Don't disable transitions on properties we are observing. See https://github.com/LeaVerou/style-observer/issues/107
			transition = transition.replace(/^none\b/, "");
		}

		// Note that in Safari < 18.2 this fires no `transitionrun` or `transitionstart` events:
		// transition: all, var(--style-observer-transition, all);
		// so we can't just concatenate with whatever the existing value is
		const prefix = transition ? transition + ", " : "";
		this.setProperty("transition", prefix + sot);

		this.updateTransitionProperties();
	}

	/**
	 * Whether the target has an open shadow root (and the modern adoptedStyleSheets API is supported).
	 * @type { boolean }
	 * @private
	 */
	get _isHost () {
		return (
			this.target.shadowRoot &&
			!bugs.ADOPTED_STYLE_SHEET &&
			!Object.isFrozen(this.target.shadowRoot.adoptedStyleSheets)
		);
	}

	/**
	 * Shadow style sheet. Only used if _isHost is true.
	 * @type { CSSStyleSheet | undefined }
	 * @private
	 */
	_shadowSheet;

	/**
	 * Any styles we've set on the target, for any reason.
	 * @type { Record<string, string> }
	 * @private
	 */
	_styles = {};

	/**
	 * Set a CSS property on the target.
	 * @param {string} property
	 * @param {string} value
	 * @param {string} [priority]
	 * @return {void}
	 */
	setProperty (property, value, priority) {
		let inlineStyle = this.target.style;
		let style = inlineStyle;
		if (this._isHost) {
			// This has an open shadow root.
			// We can use an adopted shadow style to avoid manipulating its style attribute
			if (!this._shadowSheet) {
				this._shadowSheet = new CSSStyleSheet();
				this._shadowSheet.insertRule(`:host { }`);
				this.target.shadowRoot.adoptedStyleSheets.push(this._shadowSheet);

				if (Object.keys(this._styles).length > 0) {
					// It was previously not a host, so we need to port the properties over
					for (let property in this._styles) {
						let value = this._styles[property];
						this.setProperty(property, value);

						// Remove from inline style if it hasn't changed externally
						if (inlineStyle.getPropertyValue(property) === value) {
							inlineStyle.removeProperty(property);
						}
					}
				}
			}

			style = this._shadowSheet.cssRules[0].style;
		}

		style.setProperty(property, value, priority);
		// Store reserialized value for later comparison
		this._styles[property] = this.getProperty(property);
	}

	/**
	 * Get a CSS property from the target.
	 * @param {string} property
	 * @return {string}
	 */
	getProperty (property) {
		let style = this._shadowSheet?.cssRules[0]?.style ?? this.target.style;
		return style.getPropertyValue(property);
	}

	/**
	 * Stop observing a target for changes to one or more CSS properties.
	 * @param { string | string[] } [properties] Properties to stop observing. Defaults to all observed properties.
	 * @return {void}
	 */
	unobserve (properties) {
		properties = toArray(properties);

		// Drop properties not being observed anyway
		properties = properties.filter(property => this.properties.has(property));

		for (let property of properties) {
			this.properties.delete(property);
		}

		if (this.properties.size === 0) {
			// No longer observing any properties
			this.target.removeEventListener("transitionrun", this);
			this.target.removeEventListener("transitionstart", this);
			this.target.removeEventListener("transitionend", this);
			this.renderedObserver.unobserve(this.target);
		}

		this.updateTransitionProperties();
	}

	/** All properties ever observed by this class. */
	static properties = new Set();

	/**
	 * All instances ever observed by this class.
	 */
	static all = new MultiWeakMap();
}

/**
 * Resolve the observer options.
 * @param {StyleObserverOptions} options
 * @returns {StyleObserverOptionsObject}
 */
export function resolveOptions (options) {
	if (!options) {
		return {};
	}

	if (typeof options === "string" || Array.isArray(options)) {
		options = { properties: toArray(options) };
	}
	else if (typeof options === "object") {
		options = { properties: [], ...options };
	}

	return options;
}
