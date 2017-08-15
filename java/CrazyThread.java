import java.lang.Thread;

public class CrazyThread extends Thread {
	private int sleepCount;
	private static int threadId = 0;

	public CrazyThread() {
		this.sleepCount = 0;
		this.setName("crazy thread" + CrazyThread.threadId++);

	}

	public void run() {
		while(this.sleepCount < 100) {
			System.out.println(this.sleepCount);
			this.sleepCount++;
			try {
				Thread.sleep(100);
			} catch (InterruptedException e) {}
		}
	}

}