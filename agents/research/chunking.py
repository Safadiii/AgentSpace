from agents.research.state import PageText, PaperChunk
import nltk

'''Sentence Tokenizing Using NLTK with punkt'''
def split_sentences(text: str) -> list[str]:
    return nltk.sent_tokenize(text)


''' If a sentence is too long, use the old chunking technique '''
def split_long_sentence(sentence: str, chunk_size: int, overlap: int) -> list[str]:
    if chunk_size <= 0 or not 0 <= overlap < chunk_size:
        raise ValueError("Invalid chunk size or overlap")
    words = sentence.split()
    chunks = []

    step = chunk_size - overlap
    start = 0

    while start < len(words):
        chunk = words[start:start + chunk_size]
        chunks.append(" ".join(chunk))
        if start + chunk_size >= len(words):
            break

        start += step
    return chunks

''' Sentence Chunking while preserving page numbers '''
def chunk_pages(paper_id: int, pages: list[PageText], 
                chunk_size: int = 100, overlap: int = 20) -> list[PaperChunk]:
    if not pages:
        raise ValueError("No pages to chunk")

    if chunk_size <= 0 or not 0 <= overlap < chunk_size:
        raise ValueError("chunk_size must be positive and overlap must be smaller than chunk_size")
    
    chunk_index = 0
    final: list[PaperChunk] = []
    sentences: list[tuple[str, int]] = []

    for page in pages:
        text = split_sentences(page.text)
        sentences.extend((sentence, page.page_number) for sentence in text)


    word_count = 0
    current_sentences: list[tuple[str, int]] = []

    for sentence, page_number in sentences:
        sentence_length = len(sentence.split())

        if sentence_length > chunk_size:
            if current_sentences:
                content = " ".join(s for s,p in current_sentences)
                chunk: PaperChunk = PaperChunk(paper_id=paper_id, chunk_index=chunk_index, content=content,
                                            page_start=current_sentences[0][1], page_end=current_sentences[-1][1])
                final.append(chunk)
                chunk_index += 1

            splitted_sentences = split_long_sentence(sentence, chunk_size, overlap)
            for s in splitted_sentences:
                chunk: PaperChunk = PaperChunk(paper_id=paper_id, chunk_index=chunk_index, content=s,
                                               page_start=page_number, page_end=page_number)
                final.append(chunk)
                chunk_index += 1

            current_sentences = []
            word_count = 0
            continue


        if current_sentences and word_count + sentence_length > chunk_size:
            content = " ".join(s for s,p in current_sentences)

            chunk: PaperChunk = PaperChunk(paper_id=paper_id, chunk_index=chunk_index, content=content,
                                           page_start=current_sentences[0][1], page_end=current_sentences[-1][1])

            final.append(chunk)

            chunk_index += 1

            overlap_sentences = []
            overlap_words = 0

            for s,p in reversed(current_sentences):
                length = len(s.split())

                if(overlap_words + length > overlap or overlap_words + length + sentence_length > chunk_size):
                    break
                overlap_sentences.insert(0, (s,p))
                overlap_words += length

            current_sentences = overlap_sentences
            word_count = overlap_words
        current_sentences.append((sentence, page_number))
        word_count += sentence_length

    if current_sentences:
        content = " ".join(s for s,p in current_sentences)

        chunk: PaperChunk = PaperChunk(paper_id=paper_id, chunk_index=chunk_index, content=content,
                                       page_start=current_sentences[0][1], page_end=current_sentences[-1][1])

        final.append(chunk)

    return final
