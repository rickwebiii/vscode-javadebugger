type Subscription = string;

export class Observer<T> {
	private subscriptions: {[key: string]: (value: T) => void} = Object.create(null);
	private nextSubscription = 0;

	constructor() {

	}

	/**
	 * Keeps giving notifications until the callback returns true.
	 * @param callback
	 */
	public until(callback: (value: T) => boolean) {
		let subscription: Subscription | null = null;

		const onNext = (value: T) => {
			if (callback(value)) {
				this.removeSubscription(subscription as Subscription);
			}
		}

		subscription = this.subscribe(onNext);
	}

	/**
	 * A one shot that subscribes to the next value and then unregisters the subscription.
	 */
	public next(callback: (value: T) => void) {
		this.until((value) => {
			callback(value);
			return true;
		})
	}

	public removeSubscription = (subscription: Subscription) => {
		delete this.subscriptions[subscription];
	}

	public subscribe = (callback: (value: T) => void): Subscription => {
		const subscription = this.nextSubscription.toString();
		this.nextSubscription++;

		this.subscriptions[subscription] = callback;

		return subscription;
	}

	public publish = (value: T) => {
		for (let key in this.subscriptions) {
			this.subscriptions[key](value);
		}
	}
}
