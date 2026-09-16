import { useCallback, useEffect, useState } from 'react';
import type { Job } from '../../core/models';
import {
  deleteAccountData,
  getResumableJob,
  listAccounts,
  type AccountRecord,
} from '../../platform/db';
import type { ImportResult } from '../../platform/import';
import { SETTING_CONSENT_AT, getSetting, setSetting } from '../../platform/settings';
import { Analyze } from './screens/Analyze';
import { Consent } from './screens/Consent';
import { Home } from './screens/Home';
import { Import } from './screens/Import';
import { LiveRun } from './screens/LiveRun';
import { PlanRun } from './screens/PlanRun';
import { TestRun } from './screens/TestRun';

type Screen =
  | { name: 'loading' }
  | { name: 'consent' }
  | { name: 'home' }
  | { name: 'import' }
  | { name: 'analyze'; account: AccountRecord }
  | { name: 'testrun'; account: AccountRecord }
  | { name: 'plan'; account: AccountRecord }
  | { name: 'live'; account: AccountRecord; job: Job };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);

  const refresh = useCallback(async () => {
    setAccounts(await listAccounts());
  }, []);

  useEffect(() => {
    void (async () => {
      const consent = await getSetting<string>(SETTING_CONSENT_AT);
      await refresh();
      setScreen(consent ? { name: 'home' } : { name: 'consent' });
    })();
  }, [refresh]);

  async function accept() {
    await setSetting(SETTING_CONSENT_AT, new Date().toISOString());
    setScreen({ name: 'home' });
  }

  async function imported(result: ImportResult) {
    await refresh();
    setScreen({ name: 'analyze', account: result.account });
  }

  async function remove(account: AccountRecord) {
    await deleteAccountData(account.userId);
    await refresh();
  }

  async function goRun(account: AccountRecord) {
    const job = await getResumableJob(account.userId);
    setScreen(job ? { name: 'live', account, job } : { name: 'plan', account });
  }

  return (
    <main className="page">
      <header className="top">
        <h1>tweet-sweep-2</h1>
        <span className="muted small">로컬 전용 · M1 가져오기·분석</span>
      </header>
      {screen.name === 'loading' && <p className="muted">불러오는 중…</p>}
      {screen.name === 'consent' && <Consent onAccept={() => void accept()} />}
      {screen.name === 'home' && (
        <Home
          accounts={accounts}
          onImport={() => setScreen({ name: 'import' })}
          onOpen={(account) => setScreen({ name: 'analyze', account })}
          onDelete={(account) => void remove(account)}
        />
      )}
      {screen.name === 'import' && (
        <Import onDone={(r) => void imported(r)} onCancel={() => setScreen({ name: 'home' })} />
      )}
      {screen.name === 'analyze' && screen.account.summary && (
        <Analyze
          summary={screen.account.summary}
          importedAt={screen.account.importedAt}
          onBack={() => setScreen({ name: 'home' })}
          onTestRun={() => setScreen({ name: 'testrun', account: screen.account })}
          onRun={() => void goRun(screen.account)}
        />
      )}
      {screen.name === 'testrun' && (
        <TestRun account={screen.account} onBack={() => setScreen({ name: 'home' })} />
      )}
      {screen.name === 'plan' && (
        <PlanRun
          account={screen.account}
          onPlanned={(job) => setScreen({ name: 'live', account: screen.account, job })}
          onBack={() => setScreen({ name: 'home' })}
        />
      )}
      {screen.name === 'live' && (
        <LiveRun
          account={screen.account}
          job={screen.job}
          onBack={() => setScreen({ name: 'home' })}
        />
      )}
    </main>
  );
}
