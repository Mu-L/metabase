import { useMemo } from "react";

import { useSdkQuestionContext } from "embedding-sdk/components/private/SdkQuestion/context";
import { useDatabaseListQuery } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import {
  isQuestionDirty,
  isQuestionRunnable,
} from "metabase/query_builder/utils/question";
import { Notebook as QBNotebook } from "metabase/querying/notebook/components/Notebook";
import { getSetting } from "metabase/selectors/settings";
import { ScrollArea } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type EditorProps = {
  /**
   * Callback function executed when changes are applied
   */
  onApply?: () => void;
  hasVisualizeButton?: boolean;
};

/**
 * Advanced query editor that provides full access to question configuration.
 * Includes filtering, aggregation, custom expressions, and joins.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const Editor = ({
  onApply = () => {},
  hasVisualizeButton = true,
}: EditorProps) => {
  // Loads databases and metadata so we can show notebook steps for the selected data source
  useDatabaseListQuery();

  const { question, originalQuestion, updateQuestion, queryQuestion } =
    useSdkQuestionContext();

  const isDirty = useMemo(() => {
    return isQuestionDirty(question, originalQuestion);
  }, [question, originalQuestion]);

  const isRunnable = useMemo(() => {
    return isQuestionRunnable(question, isDirty);
  }, [question, isDirty]);

  const reportTimezone = useSelector((state) =>
    getSetting(state, "report-timezone-long"),
  );

  return (
    question && (
      <ScrollArea w="100%" h="100%">
        <QBNotebook
          question={question}
          isDirty={isDirty}
          isRunnable={isRunnable}
          // the visualization button relies on this boolean
          isResultDirty={true}
          reportTimezone={reportTimezone}
          readOnly={false}
          updateQuestion={async (nextQuestion: Question) =>
            await updateQuestion(nextQuestion, { run: false })
          }
          runQuestionQuery={async () => {
            onApply();
            await queryQuestion();
          }}
          setQueryBuilderMode={() => {}}
          hasVisualizeButton={hasVisualizeButton}
        />
      </ScrollArea>
    )
  );
};
