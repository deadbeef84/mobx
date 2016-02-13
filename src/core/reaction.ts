import {IObservable, removeObserver} from "./observable";
import {IDerivation, trackDerivedFunction} from "./derivation";
import {globalState, getNextId} from "./globalstate";
import {reportTransition} from "../api/extras";
import {EMPTY_ARRAY, Lambda} from "../utils/utils";

/**
 * Reactions are a special kind of derivations. Several things distinguishes them from normal reactive computations
 *
 * 1) They will always run, whether they are used by other computations or not.
 * This means that they are very suitable for triggering side effects like logging, updating the DOM and making network requests.
 * 2) They are not observable themselves
 * 3) They will always run after any 'normal' derivations
 * 4) They are allowed to change the state and thereby triggering themselvs again, as long as they make sure the state propagates to a stable state in a reasonable amount of iterations.
 *
 * The state machine of a Reaction is as follows:
 *
 * 1) after creating, the reaction should be started by calling `runReaction` or by scheduling it (see also `autorun`)
 * 2) the `onInvalidate` handler should somehow result in a call to `this.track(someFunction)`
 * 3) all observables accessed in `someFunction` will be observed by this reaction.
 * 4) as soon as some of the dependencies has changed the Reaction will be rescheduled for another run (after the current mutation or transaction). `isScheduled` will yield true once a dependency is stale and during this period
 * 5) `onInvalidate` will be called, and we are back at step 1.
 *
 */
export class Reaction implements IDerivation {
	id = getNextId();
	name: string;
	staleObservers:  IDerivation[] = EMPTY_ARRAY; // Won't change
	observers: IDerivation[] = EMPTY_ARRAY;       // Won't change
	observing: IObservable[] = []; // nodes we are looking at. Our value depends on these nodes
	dependencyChangeCount = 0;     // nr of nodes being observed that have received a new value. If > 0, we should recompute
	dependencyStaleCount = 0;      // nr of nodes being observed that are currently not ready
	isDisposed = false;
	_isScheduled = false;

	constructor(name: string = "", private onInvalidate: () => void) {
		this.name = name || ("Reaction#" + this.id);
	}

	onBecomeObserved() {
		// noop, reaction is always unobserved
	}

	onBecomeUnobserved() {
		// noop, reaction is always unobserved
	}

	onDependenciesReady(): boolean {
		if (!this._isScheduled) {
			this._isScheduled = true;
			globalState.pendingReactions.push(this);
		}
		return false; // reactions never propagate changes
	}

	isScheduled() {
		return this.dependencyStaleCount > 0 || this._isScheduled;
	}

	/**
	 * internal
	 */
	runReaction() {
		if (!this.isDisposed) {
			this._isScheduled = false;
			this.onInvalidate();
			reportTransition(this, "READY", true); // a reaction has always 'changed'.
		}
	}

	track(fn: () => void) {
		trackDerivedFunction(this, fn);
	}

	dispose() {
		if (!this.isDisposed) {
			this.isDisposed = true;
			const deps = this.observing.splice(0);
			for (let i = 0, l = deps.length; i < l; i++)
				removeObserver(deps[i], this);
		}
	}

	getDisposer(): Lambda & { $mosbservable: Reaction } {
		const r = this.dispose.bind(this);
		r.$mobservable = this;
		return r;
	}

	toString() {
		return `Reaction[${this.name}]`;
	}
}
