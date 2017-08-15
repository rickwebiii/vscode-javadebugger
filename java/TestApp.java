import java.lang.InterruptedException;

public class TestApp {
	public static void main(String args[]) {
		CrazyThread[] crazyThreads = new CrazyThread[5];

		while (true) {
			for (int i = 0; i < 5; i++) {
				crazyThreads[i] = new CrazyThread();
				crazyThreads[i].start();
			}

			for (int i = 0; i < 5; i++) {
				try {
					crazyThreads[i].join();
				} catch (InterruptedException e){}
			}
		}
	}
}